import { beep, resume, startBeep } from './audio';

export type TimerState = {
  running: boolean;
  startsAt: number | null; // epoch ms when timer was (re)started — `now`
  durationSec: number;     // total seconds at start (300 = 5 min)
  remainingSec: number;
  pausedAt: number | null; // epoch ms when paused
};

type Listener = (s: TimerState) => void;

const DEFAULT_DURATION = 5 * 60;

let state: TimerState = {
  running: false,
  startsAt: null,
  durationSec: DEFAULT_DURATION,
  remainingSec: DEFAULT_DURATION,
  pausedAt: null
};
const listeners = new Set<Listener>();
let intervalId: number | null = null;
let lastBeepedSec = -1;
let soundOn = true;

function emit() {
  listeners.forEach((l) => l(state));
}

function tick() {
  if (!state.running || state.startsAt === null) return;
  const elapsed = (Date.now() - state.startsAt) / 1000;
  const remaining = Math.max(0, state.durationSec - elapsed);
  state = { ...state, remainingSec: remaining };

  const sec = Math.ceil(remaining);
  // Beep at 5:00, 4:00, 1:00, 0:00.
  const beepAt = [5 * 60, 4 * 60, 60, 0];
  if (soundOn && beepAt.includes(sec) && sec !== lastBeepedSec) {
    lastBeepedSec = sec;
    if (sec === 0) startBeep();
    else beep(300, 880, 0.4);
  }

  if (remaining === 0) {
    state = { ...state, running: false };
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }
  emit();
}

export function getState(): TimerState {
  return state;
}

export function subscribe(cb: Listener): () => void {
  listeners.add(cb);
  cb(state);
  return () => listeners.delete(cb);
}

export function setSound(on: boolean): void {
  soundOn = on;
}

export async function start(durationSec = DEFAULT_DURATION): Promise<void> {
  await resume();
  state = {
    running: true,
    startsAt: Date.now(),
    durationSec,
    remainingSec: durationSec,
    pausedAt: null
  };
  lastBeepedSec = -1;
  if (intervalId !== null) clearInterval(intervalId);
  intervalId = window.setInterval(tick, 200);
  emit();
}

export function pause(): void {
  if (!state.running) return;
  state = { ...state, running: false, pausedAt: Date.now() };
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  emit();
}

export async function resumeTimer(): Promise<void> {
  if (state.running || state.pausedAt === null || state.startsAt === null) return;
  await resume();
  const pauseDuration = Date.now() - state.pausedAt;
  state = {
    ...state,
    running: true,
    startsAt: state.startsAt + pauseDuration,
    pausedAt: null
  };
  if (intervalId !== null) clearInterval(intervalId);
  intervalId = window.setInterval(tick, 200);
  emit();
}

export function reset(durationSec = DEFAULT_DURATION): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  state = {
    running: false,
    startsAt: null,
    durationSec,
    remainingSec: durationSec,
    pausedAt: null
  };
  lastBeepedSec = -1;
  emit();
}

/** Snap remaining time to the closest whole minute (SYNC). */
export function sync(): void {
  if (state.startsAt === null) return;
  const remaining = state.remainingSec;
  const snapped = Math.round(remaining / 60) * 60;
  const newStartsAt = Date.now() - (state.durationSec - snapped) * 1000;
  state = { ...state, startsAt: newStartsAt, remainingSec: snapped };
  emit();
}

export function formatMmSs(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}
