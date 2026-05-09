// Microphone-driven voice memos via MediaRecorder. iOS Safari supports
// MediaRecorder since 14.3 with `audio/mp4` MIME type. Other browsers
// typically support `audio/webm`. We fall back to whatever the browser
// gives us when no preference works.

export type RecordingHandle = {
  stop: () => Promise<RecordingResult>;
  cancel: () => void;
  /** Approximate elapsed time in ms while recording (read live). */
  elapsedMs: () => number;
};

export type RecordingResult = {
  blob: Blob;
  durationMs: number;
  mimeType: string;
};

export class VoiceNoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VoiceNoteError';
  }
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/aac'
  ];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      // ignore — Safari throws on unknown types
    }
  }
  return undefined;
}

export function isAvailable(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function' &&
    typeof MediaRecorder !== 'undefined'
  );
}

export async function startRecording(): Promise<RecordingHandle> {
  if (!isAvailable()) {
    throw new VoiceNoteError(
      'Запись звука не поддерживается этим браузером.'
    );
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    const msg =
      err instanceof DOMException && err.name === 'NotAllowedError'
        ? 'Доступ к микрофону запрещён. Разреши его в настройках Safari.'
        : 'Не удалось включить микрофон.';
    throw new VoiceNoteError(msg);
  }

  const mimeType = pickMimeType();
  let recorder: MediaRecorder;
  try {
    recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    throw new VoiceNoteError(
      err instanceof Error ? err.message : 'MediaRecorder не запустился.'
    );
  }

  const chunks: Blob[] = [];
  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data);
  };

  const startedAt = performance.now();
  recorder.start(250); // chunk every 250ms so we never lose data on stop

  let cancelled = false;
  let stopped = false;

  const cleanup = () => {
    stream.getTracks().forEach((t) => t.stop());
  };

  const stop = (): Promise<RecordingResult> =>
    new Promise((resolve, reject) => {
      if (stopped) {
        reject(new VoiceNoteError('Запись уже остановлена.'));
        return;
      }
      stopped = true;
      recorder.onstop = () => {
        cleanup();
        if (cancelled) {
          reject(new VoiceNoteError('Запись отменена.'));
          return;
        }
        const finalType = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type: finalType });
        resolve({
          blob,
          durationMs: Math.round(performance.now() - startedAt),
          mimeType: finalType
        });
      };
      try {
        recorder.stop();
      } catch (err) {
        cleanup();
        reject(
          new VoiceNoteError(
            err instanceof Error ? err.message : 'Не удалось остановить запись.'
          )
        );
      }
    });

  const cancel = () => {
    cancelled = true;
    if (!stopped) {
      stopped = true;
      try {
        recorder.stop();
      } catch {
        /* ignore */
      }
    }
    cleanup();
  };

  return {
    stop,
    cancel,
    elapsedMs: () => performance.now() - startedAt
  };
}
