import { useEffect, useRef, useState } from 'react';
import { useSailingStore, selectCurrentCourse } from '../store/useSailingStore';
import * as orientation from '../services/orientation';
import { fetchCurrentWind, WindApiError } from '../services/windApi';

const COMPASS_CAPTURE_MS = 1500;

/**
 * Quick-access wind setter that can be reached straight from the live map
 * (button "🌬 Ветер" in the dashboard) without having to walk through the
 * full Setup sheet. Supports compass capture, internet, and manual entry.
 */
export function WindDrawer() {
  const drawer = useSailingStore((s) => s.drawerOpen);
  const setDrawer = useSailingStore((s) => s.setDrawer);
  const course = useSailingStore(selectCurrentCourse);
  const setWind = useSailingStore((s) => s.setWind);
  const liveGps = useSailingStore((s) => s.liveGps);

  const [windAdjust, setWindAdjust] = useState(0);
  const [headingNow, setHeadingNow] = useState<number | null>(null);
  const [permState, setPermState] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [captureProgress, setCaptureProgress] = useState(0);

  const [internetBusy, setInternetBusy] = useState(false);
  const [internetError, setInternetError] = useState<string | null>(null);
  const [internetInfo, setInternetInfo] = useState<string | null>(null);

  const captureCancel = useRef(false);
  const open = drawer === 'wind';

  useEffect(() => {
    if (!open) {
      captureCancel.current = true;
      setCapturing(false);
      setCaptureProgress(0);
    }
  }, [open]);

  if (!open) return null;

  async function onSetWind() {
    setInternetInfo(null);
    setInternetError(null);
    const r = await orientation.requestPermission();
    setPermState(r);
    if (r !== 'granted') return;

    captureCancel.current = false;
    setCapturing(true);
    setCaptureProgress(0);
    setHeadingNow(null);

    const samples: number[] = [];
    const startedAt = performance.now();
    const off = orientation.subscribe((h) => samples.push(h));

    const tick = () => {
      const elapsed = performance.now() - startedAt;
      const p = Math.min(1, elapsed / COMPASS_CAPTURE_MS);
      setCaptureProgress(p);
      if (samples.length > 0) setHeadingNow(circularMean(samples));
      if (p < 1 && !captureCancel.current) {
        requestAnimationFrame(tick);
      } else {
        off();
        setCapturing(false);
        if (samples.length === 0) {
          setPermState('no-signal');
          return;
        }
        const final = circularMean(samples);
        const corrected = (final + windAdjust + 360) % 360;
        setHeadingNow(final);
        setWind(corrected, 'heading');
      }
    };
    requestAnimationFrame(tick);
  }

  async function onInternetWind() {
    setInternetError(null);
    setInternetInfo(null);
    setInternetBusy(true);
    try {
      const coord =
        liveGps?.coord ??
        course?.pin ??
        course?.committee ??
        course?.windward ??
        null;
      if (!coord) {
        setInternetError(
          'Сначала разреши GPS или поставь хотя бы одну точку (PIN/СУДЬЯ/ВЕРХ).'
        );
        return;
      }
      const w = await fetchCurrentWind(coord.lat, coord.lon);
      setWind(w.direction, 'manual');
      const speedKnots = w.speedMps * 1.94384;
      const ageMin = Math.max(0, Math.round((Date.now() - w.forecastTime) / 60000));
      setInternetInfo(
        `Open-Meteo: ${Math.round(w.direction)}°, ${speedKnots.toFixed(1)} уз${
          ageMin > 0 ? ` (актуально ${ageMin} мин назад)` : ''
        }`
      );
    } catch (e) {
      const msg =
        e instanceof WindApiError
          ? e.message
          : e instanceof Error
          ? e.message
          : 'Не удалось получить ветер';
      setInternetError(msg);
    } finally {
      setInternetBusy(false);
    }
  }

  function onManualWind(direction: number) {
    setWind((direction + 360) % 360, 'manual');
  }

  return (
    <div
      className="fixed inset-0 drawer-overlay bg-black/50 flex items-end sm:items-center justify-center"
      onClick={() => setDrawer(null)}
    >
      <div
        className="w-full sm:max-w-xl bg-navyDeep rounded-t-3xl sm:rounded-3xl p-4 max-h-[92dvh] overflow-y-auto safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl sm:text-2xl font-bold">Ветер</h2>
          <button className="min-w-[48px] min-h-[48px] text-2xl" onClick={() => setDrawer(null)}>
            ✕
          </button>
        </div>

        <div className="text-sm text-white/70 mb-3 leading-snug">
          Наведи нос катера ровно на ветер и нажми «Указать компасом».
          Программа усреднит компас за 1.5 секунды и запишет направление
          откуда дует ветер (TWD).
        </div>

        {course?.windDirection !== null && course?.windDirection !== undefined ? (
          <div className="bg-navy rounded-2xl p-3 mb-3 flex items-center justify-between">
            <div>
              <div className="text-xs text-white/60">сейчас</div>
              <div className="text-3xl font-extrabold tabular-nums text-windYellow">
                {Math.round(course.windDirection)}°
              </div>
            </div>
            <div className="text-xs text-white/60 text-right max-w-[55%] leading-snug">
              откуда дует. На карте лестница и лей-лайны обновятся
              автоматически.
            </div>
          </div>
        ) : null}

        <button
          type="button"
          className="relative w-full min-h-[88px] rounded-2xl bg-windYellow text-navy text-xl font-extrabold active:opacity-80 mb-2 overflow-hidden"
          onClick={onSetWind}
          disabled={capturing}
        >
          <div
            className="absolute inset-0 bg-white/30 origin-left"
            style={{ transform: `scaleX(${captureProgress})` }}
          />
          <span className="relative z-10">
            {capturing
              ? `Удерживай нос в ветер… ${Math.round(captureProgress * 100)}%`
              : '🧭 Указать ветер компасом'}
          </span>
        </button>

        <button
          type="button"
          className="w-full min-h-[64px] rounded-2xl bg-windwardBlue text-white text-base font-bold active:opacity-80 mb-2 disabled:opacity-50"
          onClick={onInternetWind}
          disabled={internetBusy}
        >
          {internetBusy ? 'Загружаю…' : '🌐 Получить ветер из интернета'}
        </button>

        {internetInfo && <div className="text-committeeGreen text-sm mb-2">{internetInfo}</div>}
        {internetError && <div className="text-pinRed text-sm mb-2">{internetError}</div>}

        {permState === 'denied' && (
          <div className="text-pinRed text-sm mb-2">
            Доступ к компасу запрещён. На iPhone: Настройки → Safari → Доступ
            к движению и ориентации.
          </div>
        )}
        {permState === 'unsupported' && (
          <div className="text-yellow-400 text-sm mb-2">
            Этот браузер не поддерживает компас. Введи направление вручную или
            получи из интернета.
          </div>
        )}
        {permState === 'no-signal' && (
          <div className="text-yellow-400 text-sm mb-2">
            Компас молчал {COMPASS_CAPTURE_MS}мс. Откалибруй (двигай телефон
            восьмёркой) и попробуй снова.
          </div>
        )}
        {headingNow !== null && (
          <div className="text-sm text-white/70 mb-2">
            Снято с компаса: <b>{Math.round(headingNow)}°</b>
            {windAdjust !== 0
              ? ` + коррекция ${windAdjust}° = ${Math.round(
                  (headingNow + windAdjust + 360) % 360
                )}°`
              : ''}
          </div>
        )}

        <div className="bg-navy rounded-2xl p-3 mb-3">
          <div className="flex items-center gap-3">
            <label className="text-sm text-white/70 w-24">Коррекция</label>
            <input
              type="range"
              min={-20}
              max={20}
              step={1}
              value={windAdjust}
              onChange={(e) => setWindAdjust(parseInt(e.target.value, 10))}
              className="flex-1"
            />
            <span className="w-12 text-right tabular-nums">{windAdjust}°</span>
          </div>
          <div className="flex items-center gap-3 mt-3">
            <label className="text-sm text-white/70 w-24">Вручную</label>
            <input
              type="number"
              min={0}
              max={359}
              defaultValue={course?.windDirection ?? 0}
              onBlur={(e) => onManualWind(parseInt(e.target.value, 10) || 0)}
              className="flex-1 bg-navyDeep border border-white/10 rounded-xl p-2 text-base"
            />
            <span className="w-12 text-right">°TWD</span>
          </div>
        </div>

        <button
          className="w-full min-h-[56px] rounded-2xl bg-windwardBlue text-base font-bold"
          onClick={() => setDrawer(null)}
        >
          Готово
        </button>
      </div>
    </div>
  );
}

function circularMean(values: number[]): number {
  if (values.length === 0) return 0;
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
