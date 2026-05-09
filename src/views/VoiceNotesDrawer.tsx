import { useEffect, useRef, useState } from 'react';
import {
  selectCurrentCourse,
  useSailingStore,
  type VoiceNote
} from '../store/useSailingStore';
import {
  isAvailable,
  startRecording,
  VoiceNoteError,
  type RecordingHandle
} from '../services/voiceNotes';
import { loadAudio } from '../db/persistence';

export function VoiceNotesDrawer() {
  const drawer = useSailingStore((s) => s.drawerOpen);
  const setDrawer = useSailingStore((s) => s.setDrawer);
  const course = useSailingStore(selectCurrentCourse);
  const liveGps = useSailingStore((s) => s.liveGps);
  const addVoiceNote = useSailingStore((s) => s.addVoiceNote);
  const removeVoiceNote = useSailingStore((s) => s.removeVoiceNote);

  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const handleRef = useRef<RecordingHandle | null>(null);
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    return () => stopTicking();
  }, []);

  useEffect(() => {
    if (drawer !== 'voice' && handleRef.current) {
      handleRef.current.cancel();
      handleRef.current = null;
      stopTicking();
      setRecording(false);
    }
  }, [drawer]);

  if (drawer !== 'voice') return null;

  function stopTicking() {
    if (tickRef.current !== null) {
      cancelAnimationFrame(tickRef.current);
      tickRef.current = null;
    }
  }

  function loop() {
    if (!handleRef.current) return;
    setElapsed(Math.round(handleRef.current.elapsedMs()));
    tickRef.current = requestAnimationFrame(loop);
  }

  async function onStart() {
    setError(null);
    if (!isAvailable()) {
      setError('Микрофон недоступен в этом браузере.');
      return;
    }
    try {
      handleRef.current = await startRecording();
      setRecording(true);
      setElapsed(0);
      tickRef.current = requestAnimationFrame(loop);
    } catch (e) {
      const msg = e instanceof VoiceNoteError ? e.message : 'Ошибка микрофона.';
      setError(msg);
    }
  }

  async function onStop() {
    if (!handleRef.current) return;
    try {
      const r = await handleRef.current.stop();
      handleRef.current = null;
      stopTicking();
      setRecording(false);
      await addVoiceNote(r.blob, r.durationMs, liveGps?.coord ?? null);
    } catch (e) {
      const msg = e instanceof VoiceNoteError ? e.message : 'Ошибка записи.';
      setError(msg);
      stopTicking();
      setRecording(false);
    }
  }

  function onCancel() {
    if (handleRef.current) {
      handleRef.current.cancel();
      handleRef.current = null;
    }
    stopTicking();
    setRecording(false);
  }

  const notes = [...(course?.voiceNotes ?? [])].sort((a, b) => b.ts - a.ts);

  return (
    <div
      className="fixed inset-0 drawer-overlay bg-black/40 flex items-end sm:items-center justify-center"
      onClick={() => setDrawer(null)}
    >
      <div
        className="w-full sm:max-w-xl bg-navyDeep rounded-t-3xl sm:rounded-3xl max-h-[92dvh] flex flex-col safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 pb-2 shrink-0">
          <h2 className="text-xl sm:text-2xl font-bold">Голосовые метки</h2>
          <button className="min-w-[48px] min-h-[48px] text-2xl" onClick={() => setDrawer(null)}>
            ✕
          </button>
        </div>

        {/* Scrollable list of past notes */}
        <div className="flex-1 overflow-y-auto px-4 pb-2 min-h-0">
          <div className="text-xs text-white/50 mb-3">
            Каждая метка привязана к времени и GPS-координатам катера. Вечером на
            разборе откроешь карту — увидишь, где была сделана.
          </div>
          {notes.length === 0 ? (
            <div className="text-center text-white/50 py-8">Пока нет меток</div>
          ) : (
            <div className="space-y-2">
              {notes.map((n) => (
                <NoteRow
                  key={n.id}
                  note={n}
                  onDelete={() => void removeVoiceNote(n.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Pinned recording controls — always visible, even with long history */}
        <div className="shrink-0 p-3 border-t border-white/10 bg-navyDeep">
          {recording ? (
            <div className="space-y-2">
              <div className="text-center text-2xl font-bold text-pinRed tabular-nums">
                ● {formatMs(elapsed)}
              </div>
              <button
                type="button"
                onClick={onStop}
                className="w-full min-h-[72px] rounded-2xl bg-committeeGreen text-white text-xl font-bold"
              >
                Стоп и сохранить
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="w-full min-h-[48px] rounded-2xl bg-white/10 text-sm font-bold"
              >
                Отменить
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onStart}
              className="w-full min-h-[72px] rounded-2xl bg-pinRed text-white text-xl font-extrabold flex items-center justify-center gap-3"
            >
              🎤 Начать запись
            </button>
          )}
          {error && <div className="text-pinRed text-sm mt-2">{error}</div>}
        </div>
      </div>
    </div>
  );
}

function NoteRow({ note, onDelete }: { note: VoiceNote; onDelete: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  async function preload() {
    if (url || loading) return;
    setLoading(true);
    const blob = await loadAudio(note.audioId);
    if (blob) setUrl(URL.createObjectURL(blob));
    setLoading(false);
  }

  return (
    <div className="bg-navy rounded-2xl p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm">
          <div className="font-semibold">
            {new Date(note.ts).toLocaleTimeString('ru-RU')}
          </div>
          <div className="text-white/60 text-xs">
            {formatMs(note.durationMs)}
            {note.lat !== null && note.lon !== null
              ? ` · ${note.lat.toFixed(5)}, ${note.lon.toFixed(5)}`
              : ' · без GPS'}
          </div>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="min-w-[40px] min-h-[40px] rounded-xl bg-white/10 text-white/70"
        >
          🗑
        </button>
      </div>
      {url ? (
        <audio controls src={url} className="w-full mt-2" />
      ) : (
        <button
          type="button"
          onClick={preload}
          disabled={loading}
          className="w-full mt-2 min-h-[44px] rounded-xl bg-windwardBlue text-white text-base font-bold disabled:opacity-50"
        >
          {loading ? 'Загружаю…' : '▶ Слушать'}
        </button>
      )}
    </div>
  );
}

function formatMs(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
