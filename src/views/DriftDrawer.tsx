import { useEffect, useRef, useState } from 'react';
import { selectCurrentCourse, useSailingStore } from '../store/useSailingStore';
import {
  startDrift,
  bearingLabel,
  mpsToKnots,
  DriftError,
  type DriftHandle
} from '../services/currentDrift';

const RECOMMENDED_MS = 90_000;

export function DriftDrawer() {
  const drawer = useSailingStore((s) => s.drawerOpen);
  const setDrawer = useSailingStore((s) => s.setDrawer);
  const course = useSailingStore(selectCurrentCourse);
  const setCurrent = useSailingStore((s) => s.setCurrent);

  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [samples, setSamples] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const handleRef = useRef<DriftHandle | null>(null);
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    if (drawer !== 'drift' && handleRef.current) {
      handleRef.current.cancel();
      handleRef.current = null;
      stopTicking();
      setRunning(false);
    }
  }, [drawer]);

  useEffect(() => () => stopTicking(), []);

  if (drawer !== 'drift') return null;

  function stopTicking() {
    if (tickRef.current !== null) {
      cancelAnimationFrame(tickRef.current);
      tickRef.current = null;
    }
  }

  function loop() {
    if (!handleRef.current) return;
    setElapsed(Math.round(handleRef.current.elapsedMs()));
    setSamples(handleRef.current.sampleCount());
    tickRef.current = requestAnimationFrame(loop);
  }

  function onStart() {
    setError(null);
    try {
      handleRef.current = startDrift({ minDurationMs: 30_000 });
      setRunning(true);
      setElapsed(0);
      setSamples(0);
      tickRef.current = requestAnimationFrame(loop);
    } catch (e) {
      setError(e instanceof DriftError ? e.message : 'Не удалось начать замер.');
    }
  }

  async function onStop() {
    if (!handleRef.current) return;
    try {
      const r = await handleRef.current.stop();
      handleRef.current = null;
      stopTicking();
      setRunning(false);
      setCurrent(r);
    } catch (e) {
      setError(e instanceof DriftError ? e.message : 'Ошибка замера.');
      stopTicking();
      setRunning(false);
    }
  }

  function onCancel() {
    if (handleRef.current) {
      handleRef.current.cancel();
      handleRef.current = null;
    }
    stopTicking();
    setRunning(false);
  }

  function onClear() {
    if (confirm('Удалить сохранённое течение?')) {
      setCurrent(null);
    }
  }

  const current = course?.current ?? null;
  const minProgress = Math.min(1, elapsed / 30_000);
  const recommendedProgress = Math.min(1, elapsed / RECOMMENDED_MS);

  return (
    <div
      className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center"
      onClick={() => setDrawer(null)}
    >
      <div
        className="w-full sm:max-w-xl bg-navyDeep rounded-t-3xl sm:rounded-3xl p-4 max-h-[92dvh] overflow-y-auto safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl sm:text-2xl font-bold">Замер течения</h2>
          <button className="min-w-[48px] min-h-[48px] text-2xl" onClick={() => setDrawer(null)}>
            ✕
          </button>
        </div>

        <div className="text-sm text-white/70 mb-4 leading-relaxed">
          Подойди к точке замера, заглуши мотор и не трогай руль 1–2 минуты.
          Программа считает GPS-снос и выдаст вектор течения.
        </div>

        {running ? (
          <div className="bg-navy rounded-2xl p-4 mb-3">
            <div className="text-center text-3xl font-bold tabular-nums">
              {formatMs(elapsed)}
            </div>
            <div className="text-center text-sm text-white/60 mt-1">
              GPS-точек: {samples}
            </div>
            <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-windwardBlue"
                style={{ width: `${recommendedProgress * 100}%` }}
              />
            </div>
            <div className="text-xs text-white/50 mt-1 text-center">
              {minProgress < 1
                ? `Минимум 30с (${Math.round(minProgress * 100)}%)`
                : 'Можно останавливать. Лучше — после 90с.'}
            </div>

            <div className="grid grid-cols-2 gap-2 mt-4">
              <button
                type="button"
                onClick={onCancel}
                className="min-h-[56px] rounded-2xl bg-white/10 text-base font-bold"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={onStop}
                disabled={minProgress < 1}
                className="min-h-[56px] rounded-2xl bg-committeeGreen text-white text-base font-bold disabled:opacity-50"
              >
                Готово
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={onStart}
            className="w-full min-h-[88px] rounded-2xl bg-windwardBlue text-white text-2xl font-extrabold mb-3"
          >
            ⛵ Старт замера
          </button>
        )}

        {error && <div className="text-pinRed text-sm mb-3">{error}</div>}

        {current ? (
          <div className="bg-navy rounded-2xl p-4">
            <div className="text-sm text-white/60 mb-1">Сохранённое течение</div>
            <div className="text-3xl font-extrabold text-windYellow">
              {Math.round(current.setDirection)}° {bearingLabel(current.setDirection)}
            </div>
            <div className="text-xl mt-1 tabular-nums">
              {mpsToKnots(current.speedMps).toFixed(2)} уз
              <span className="text-white/50 text-sm ml-2">
                ({current.speedMps.toFixed(2)} м/с)
              </span>
            </div>
            <div className="text-xs text-white/50 mt-2">
              Снос {Math.round(current.distanceMeters)} м за{' '}
              {Math.round(current.durationMs / 1000)}с,{' '}
              {current.samples} GPS-точек,{' '}
              {new Date(current.measuredAt).toLocaleTimeString('ru-RU')}.
            </div>
            <button
              type="button"
              onClick={onClear}
              className="w-full mt-3 min-h-[44px] rounded-xl bg-white/10 text-sm"
            >
              Очистить
            </button>
          </div>
        ) : (
          <div className="text-center text-white/50 py-4 text-sm">
            Ещё нет данных о течении.
          </div>
        )}
      </div>
    </div>
  );
}

function formatMs(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
