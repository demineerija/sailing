import { useEffect, useRef, useState } from 'react';
import { useSailingStore, type MarkKey } from '../store/useSailingStore';
import * as orientation from '../services/orientation';
import { projectCoord } from '../math/sailing';

const SAMPLE_MS = 800;

export function PingAtDistanceDrawer() {
  const drawer = useSailingStore((s) => s.drawerOpen);
  const setDrawer = useSailingStore((s) => s.setDrawer);
  const liveGps = useSailingStore((s) => s.liveGps);
  const pingMark = useSailingStore((s) => s.pingMark);
  const settings = useSailingStore((s) => s.settings);
  const setSettings = useSailingStore((s) => s.setSettings);

  const [mark, setMark] = useState<MarkKey>('pin');
  const [distance, setDistance] = useState(settings.pingAtDistanceMeters);
  const [heading, setHeading] = useState<number | null>(liveGps?.headingTrue ?? null);
  const [busy, setBusy] = useState(false);
  const [permState, setPermState] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const offRef = useRef<(() => void) | null>(null);

  // While the drawer is open, subscribe to compass updates so the user can
  // see the current bearing live (and we always have a fresh value to use).
  useEffect(() => {
    if (drawer !== 'pingDist') return;
    const off = orientation.subscribe((h) => setHeading(h));
    offRef.current = off;
    return () => {
      off();
      offRef.current = null;
    };
  }, [drawer]);

  if (drawer !== 'pingDist') return null;

  async function ensureCompass() {
    if (orientation.isPermissionGranted()) return true;
    const r = await orientation.requestPermission();
    setPermState(r);
    return r === 'granted';
  }

  async function onPing() {
    setError(null);
    setSuccess(null);
    if (!liveGps) {
      setError('Нет GPS-фикса. Подожди или выйди на открытое место.');
      return;
    }
    setBusy(true);
    try {
      const gotPerm = await ensureCompass();
      if (!gotPerm) {
        setError('Нужен компас. Разреши «Движение и ориентация» в Safari.');
        return;
      }
      // Average compass for ~SAMPLE_MS to smooth out jitter.
      const samples: number[] = [];
      const startedAt = performance.now();
      const off = orientation.subscribe((h) => samples.push(h));
      await new Promise((r) => setTimeout(r, SAMPLE_MS));
      off();
      // Add the current value too in case no callback fired.
      if (heading !== null) samples.push(heading);
      if (samples.length === 0) {
        setError(`Компас молчит. Подожди ${SAMPLE_MS}мс и повтори.`);
        return;
      }
      const bearing = circularMean(samples);
      const projected = projectCoord(liveGps.coord, bearing, distance);
      pingMark(mark, projected, liveGps.accuracy);
      const elapsed = Math.round(performance.now() - startedAt);
      setSuccess(
        `Поставил ${labelOf(mark)} на ${distance > 0 ? '+' : ''}${distance}м (курс ${Math.round(
          bearing
        )}°, замер ${elapsed}мс).`
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 drawer-overlay bg-black/40 flex items-end sm:items-center justify-center"
      onClick={() => setDrawer(null)}
    >
      <div
        className="w-full sm:max-w-xl bg-navyDeep rounded-t-3xl sm:rounded-3xl p-4 max-h-[92dvh] overflow-y-auto safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl sm:text-2xl font-bold">Постановка на расстоянии</h2>
          <button className="min-w-[48px] min-h-[48px] text-2xl" onClick={() => setDrawer(null)}>
            ✕
          </button>
        </div>

        <div className="text-sm text-white/70 mb-4 leading-relaxed">
          Направь нос катера на буй и нажми «Поставить». Программа возьмёт твою
          GPS-точку и сместит её вперёд на заданное расстояние, чтобы не идти
          вплотную и не мешать гонщикам.
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          <MarkPick label="PIN" value="pin" current={mark} onPick={setMark} color="bg-pinRed" />
          <MarkPick label="СУДЬЯ" value="committee" current={mark} onPick={setMark} color="bg-committeeGreen" />
          <MarkPick label="ВЕРХ" value="windward" current={mark} onPick={setMark} color="bg-windwardBlue" />
        </div>

        <div className="bg-navy rounded-2xl p-3 mb-3">
          <div className="flex items-center gap-3">
            <label className="text-sm text-white/70 w-32">Дистанция вперёд</label>
            <input
              type="range"
              min={-30}
              max={30}
              step={1}
              value={distance}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                setDistance(v);
                setSettings({ pingAtDistanceMeters: v });
              }}
              className="flex-1"
            />
            <span className="w-16 text-right tabular-nums text-base">{distance}м</span>
          </div>
          <div className="text-xs text-white/50 mt-1">
            Минус — поставить позади катера.
          </div>
        </div>

        <div className="bg-navy rounded-2xl p-3 mb-3 grid grid-cols-2 gap-3">
          <Stat
            label="Компас"
            value={heading === null ? '—' : `${Math.round(heading)}°`}
          />
          <Stat
            label="GPS"
            value={liveGps ? `±${Math.round(liveGps.accuracy)}м` : '—'}
          />
        </div>

        <button
          type="button"
          onClick={onPing}
          disabled={busy}
          className="w-full min-h-[88px] rounded-2xl bg-windYellow text-navy text-2xl font-extrabold disabled:opacity-50"
        >
          {busy ? 'Беру курс…' : `📍 Поставить ${labelOf(mark)}`}
        </button>

        {permState === 'denied' && (
          <div className="text-pinRed text-sm mt-2">
            Доступ к компасу запрещён. На iPhone: Настройки → Safari → Доступ к движению и ориентации.
          </div>
        )}
        {permState === 'unsupported' && (
          <div className="text-yellow-400 text-sm mt-2">
            Этот браузер не поддерживает компас. Используй обычную постановку.
          </div>
        )}
        {error && <div className="text-pinRed text-sm mt-2">{error}</div>}
        {success && <div className="text-committeeGreen text-sm mt-2">{success}</div>}
      </div>
    </div>
  );
}

function MarkPick({
  label,
  value,
  current,
  onPick,
  color
}: {
  label: string;
  value: MarkKey;
  current: MarkKey;
  onPick: (m: MarkKey) => void;
  color: string;
}) {
  const active = value === current;
  return (
    <button
      type="button"
      onClick={() => onPick(value)}
      className={`min-h-[56px] rounded-2xl text-base font-bold border-2 ${
        active ? `${color} text-white border-white` : 'bg-navy text-white/80 border-white/10'
      }`}
    >
      {label}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-xs text-white/60">{label}</div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function labelOf(m: MarkKey): string {
  return m === 'pin' ? 'PIN' : m === 'committee' ? 'СУДЬЯ' : 'ВЕРХ';
}

function circularMean(values: number[]): number {
  let sx = 0;
  let sy = 0;
  for (const v of values) {
    const r = (v * Math.PI) / 180;
    sx += Math.cos(r);
    sy += Math.sin(r);
  }
  const mean = (Math.atan2(sy, sx) * 180) / Math.PI;
  return (mean + 360) % 360;
}
