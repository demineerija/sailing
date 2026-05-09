import { useEffect, useState } from 'react';
import * as timer from '../services/timer';
import { useSailingStore } from '../store/useSailingStore';

export function TimerCompact() {
  const setDrawer = useSailingStore((s) => s.setDrawer);
  const [s, setS] = useState(timer.getState());
  useEffect(() => timer.subscribe(setS), []);
  return (
    <button
      type="button"
      className="min-h-[88px] flex flex-col items-center justify-center bg-navyDeep rounded-2xl px-4 active:opacity-80"
      onClick={() => setDrawer('timer')}
    >
      <div className="text-4xl font-black tabular-nums">
        {timer.formatMmSs(s.remainingSec)}
      </div>
      <div className="text-xs text-white/60">{s.running ? 'таймер идёт' : 'таймер'}</div>
    </button>
  );
}

export function TimerFullscreen() {
  const drawer = useSailingStore((s) => s.drawerOpen);
  const setDrawer = useSailingStore((s) => s.setDrawer);
  const sound = useSailingStore((st) => st.settings.sound);
  const [s, setS] = useState(timer.getState());
  useEffect(() => timer.subscribe(setS), []);
  useEffect(() => timer.setSound(sound), [sound]);

  if (drawer !== 'timer') return null;

  const min = Math.ceil(s.remainingSec / 60);
  const color = s.remainingSec <= 60 ? 'text-pinRed' : min <= 4 ? 'text-windYellow' : 'text-committeeGreen';

  return (
    <div className="fixed inset-0 drawer-overlay bg-navy flex flex-col safe-top safe-bottom">
      <div className="flex justify-end p-3">
        <button className="min-w-[64px] min-h-[64px] text-3xl" onClick={() => setDrawer(null)}>
          ✕
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className={`text-[28vh] font-black tabular-nums leading-none ${color}`}>
          {timer.formatMmSs(s.remainingSec)}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 p-4">
        <button
          className="min-h-[88px] rounded-2xl bg-committeeGreen text-2xl font-bold"
          onClick={() => (s.running ? timer.pause() : s.pausedAt !== null ? timer.resumeTimer() : timer.start(5 * 60))}
        >
          {s.running ? 'Пауза' : s.pausedAt !== null ? 'Продолжить' : 'Старт 5:00'}
        </button>
        <button
          className="min-h-[88px] rounded-2xl bg-windYellow text-navy text-2xl font-bold"
          onClick={timer.sync}
        >
          SYNC
        </button>
        <button
          className="min-h-[88px] rounded-2xl bg-white/10 text-2xl font-bold"
          onClick={() => timer.start(4 * 60)}
        >
          Старт 4:00
        </button>
        <button
          className="min-h-[88px] rounded-2xl bg-pinRed text-2xl font-bold"
          onClick={() => timer.reset()}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
