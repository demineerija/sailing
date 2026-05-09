import { useEffect, useRef, useState } from 'react';
import { pingProjected } from '../services/pingProjected';
import type { GeoCoord } from '../math/sailing';

type Props = {
  label: string;
  emoji: string;
  color: string; // tailwind bg classname
  holdMs: number;
  onPing: (coord: GeoCoord, accuracy: number, samples: number) => void;
  pingedAt?: number | null;
  accuracyHint?: number | null;
  /** If non-zero, the GPS fix is projected this far in the direction the
   *  boat is pointing (averaged compass during the hold). Negative = behind. */
  offsetMeters?: number;
};

export function PingButton({
  label,
  emoji,
  color,
  holdMs,
  onPing,
  pingedAt,
  accuracyHint,
  offsetMeters = 0
}: Props) {
  const [progress, setProgress] = useState(0);
  const [pinging, setPinging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedAt = useRef<number>(0);
  const cancelled = useRef(false);

  const tick = () => {
    const elapsed = performance.now() - startedAt.current;
    const p = Math.min(1, elapsed / holdMs);
    setProgress(p);
    if (p < 1 && !cancelled.current) {
      rafRef.current = requestAnimationFrame(tick);
    }
  };

  const begin = async () => {
    if (pinging) return;
    cancelled.current = false;
    setError(null);
    setInfo(null);
    setPinging(true);
    setProgress(0);
    startedAt.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
    try {
      const r = await pingProjected(holdMs, offsetMeters);
      if (!cancelled.current) {
        onPing(r.coord, r.accuracy, r.samples);
        if (offsetMeters !== 0) {
          if (r.offsetApplied !== 0 && r.headingTrue !== null) {
            setInfo(
              `смещено на ${offsetMeters > 0 ? '+' : ''}${offsetMeters}м (курс ${Math.round(
                r.headingTrue
              )}°)`
            );
          } else {
            setInfo(
              `компас не дал данных — поставил ровно по своей точке`
            );
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'GPS ошибка';
      setError(msg);
    } finally {
      setPinging(false);
      setProgress(0);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    }
  };

  const end = () => {
    cancelled.current = true;
    setPinging(false);
    setProgress(0);
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  };

  useEffect(() => {
    return () => {
      cancelled.current = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const pingedLabel = pingedAt
    ? formatMinAgo(Date.now() - pingedAt)
    : '—';

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        className={`relative w-full min-h-[88px] rounded-2xl ${color} text-white text-2xl font-bold flex items-center justify-center gap-3 active:opacity-80 select-none touch-manipulation overflow-hidden border-4 border-white/10`}
        onPointerDown={begin}
        onPointerUp={end}
        onPointerLeave={end}
        onPointerCancel={end}
      >
        <div
          className="absolute inset-0 bg-white/20 origin-left"
          style={{ transform: `scaleX(${progress})`, transition: 'transform 50ms linear' }}
        />
        <span className="relative z-10 text-3xl">{emoji}</span>
        <span className="relative z-10">{label}</span>
      </button>
      <div className="flex justify-between text-sm text-white/70 px-2">
        <span>
          GPS: {accuracyHint ? `±${Math.round(accuracyHint)}м` : '—'}
        </span>
        <span>зафиксировано: {pingedLabel}</span>
      </div>
      {error ? <div className="text-pinRed text-sm px-2">{error}</div> : null}
      {info ? <div className="text-windYellow text-xs px-2">{info}</div> : null}
    </div>
  );
}

function formatMinAgo(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}с назад`;
  const m = Math.round(s / 60);
  return `${m}мин назад`;
}
