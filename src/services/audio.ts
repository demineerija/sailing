let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const W = window as Window & { webkitAudioContext?: typeof AudioContext };
  const Ctor = window.AudioContext || W.webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

/** Must be called from a user gesture so iOS Safari unlocks audio. */
export async function resume(): Promise<void> {
  const c = getCtx();
  if (c && c.state === 'suspended') await c.resume();
}

export function beep(durationMs = 300, frequency = 880, gain = 0.4): void {
  const c = getCtx();
  if (!c || c.state !== 'running') return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.frequency.value = frequency;
  osc.type = 'sine';
  g.gain.value = gain;
  osc.connect(g).connect(c.destination);
  const now = c.currentTime;
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
  osc.start(now);
  osc.stop(now + durationMs / 1000);
}

export function startBeep(): void {
  beep(800, 1320, 0.5);
}
