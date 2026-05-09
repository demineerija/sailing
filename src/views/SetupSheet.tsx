import { useEffect, useRef, useState } from 'react';
import { useSailingStore, selectCurrentCourse } from '../store/useSailingStore';
import { PingButton } from './PingButton';
import * as orientation from '../services/orientation';
import { fetchCurrentWind, WindApiError } from '../services/windApi';

const COMPASS_CAPTURE_MS = 1500;

export function SetupSheet() {
  const drawer = useSailingStore((s) => s.drawerOpen);
  const setDrawer = useSailingStore((s) => s.setDrawer);
  const course = useSailingStore(selectCurrentCourse);
  const pingMark = useSailingStore((s) => s.pingMark);
  const setWind = useSailingStore((s) => s.setWind);
  const settings = useSailingStore((s) => s.settings);
  const liveGps = useSailingStore((s) => s.liveGps);
  const newRace = useSailingStore((s) => s.newRace);
  const setCourseName = useSailingStore((s) => s.setCourseName);

  const [windAdjust, setWindAdjust] = useState(0);
  const [headingNow, setHeadingNow] = useState<number | null>(null);
  const [permState, setPermState] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [captureProgress, setCaptureProgress] = useState(0);

  const [internetBusy, setInternetBusy] = useState(false);
  const [internetError, setInternetError] = useState<string | null>(null);
  const [internetInfo, setInternetInfo] = useState<string | null>(null);

  const captureCancel = useRef(false);

  useEffect(() => {
    if (drawer !== 'setup') {
      captureCancel.current = true;
      setCapturing(false);
      setCaptureProgress(0);
    }
  }, [drawer]);

  if (drawer !== 'setup') return null;

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

    const off = orientation.subscribe((h) => {
      samples.push(h);
    });

    const tick = () => {
      const elapsed = performance.now() - startedAt;
      const p = Math.min(1, elapsed / COMPASS_CAPTURE_MS);
      setCaptureProgress(p);
      if (samples.length > 0) {
        setHeadingNow(circularMean(samples));
      }
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
      const coord = liveGps?.coord ?? guessCoordFromCourse();
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

  function guessCoordFromCourse() {
    return (
      course?.pin ??
      course?.committee ??
      course?.windward ??
      null
    );
  }

  function onManualWind(direction: number) {
    setWind((direction + 360) % 360, 'manual');
  }

  return (
    <div className="fixed inset-0 drawer-overlay bg-black/40 flex items-end sm:items-center justify-center" onClick={() => setDrawer(null)}>
      <div
        className="w-full sm:max-w-2xl bg-navyDeep rounded-t-3xl sm:rounded-3xl p-4 max-h-[92dvh] overflow-y-auto safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl sm:text-2xl font-bold">Постановка курса</h2>
          <button className="min-w-[48px] min-h-[48px] text-2xl" onClick={() => setDrawer(null)}>
            ✕
          </button>
        </div>

        <input
          type="text"
          value={course?.name ?? ''}
          onChange={(e) => setCourseName(e.target.value)}
          placeholder="Название гонки"
          className="w-full bg-navy border border-white/10 rounded-xl p-3 mb-4 text-base"
        />

        <div className="grid grid-cols-1 gap-3">
          <PingButton
            label="PIN"
            emoji="📍"
            color="bg-pinRed"
            holdMs={settings.holdMs}
            offsetMeters={settings.pingAtDistanceMeters}
            pingedAt={course?.pin?.ts ?? null}
            accuracyHint={liveGps?.accuracy ?? null}
            onPing={(coord, accuracy) => pingMark('pin', coord, accuracy)}
          />
          <PingButton
            label="СУДЬЯ"
            emoji="🚩"
            color="bg-committeeGreen"
            holdMs={settings.holdMs}
            offsetMeters={settings.pingAtDistanceMeters}
            pingedAt={course?.committee?.ts ?? null}
            accuracyHint={liveGps?.accuracy ?? null}
            onPing={(coord, accuracy) => pingMark('committee', coord, accuracy)}
          />
          <PingButton
            label="ВЕРХ"
            emoji="🔺"
            color="bg-windwardBlue"
            holdMs={settings.holdMs}
            offsetMeters={settings.pingAtDistanceMeters}
            pingedAt={course?.windward?.ts ?? null}
            accuracyHint={liveGps?.accuracy ?? null}
            onPing={(coord, accuracy) => pingMark('windward', coord, accuracy)}
          />
        </div>

        {settings.pingAtDistanceMeters !== 0 && (
          <div className="text-xs text-windYellow mt-2 leading-snug">
            Постановка со смещением: {settings.pingAtDistanceMeters > 0 ? '+' : ''}
            {settings.pingAtDistanceMeters}м по носу. Меняется в Настройках.
          </div>
        )}

        <div className="mt-6 p-3 bg-navy rounded-2xl">
          <div className="text-lg font-semibold mb-2">Ветер</div>
          <button
            type="button"
            className="relative w-full min-h-[64px] rounded-2xl bg-windYellow text-navy text-base sm:text-lg font-bold active:opacity-80 mb-2 overflow-hidden"
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
                : 'Указать ветер компасом'}
            </span>
          </button>

          <button
            type="button"
            className="w-full min-h-[56px] rounded-2xl bg-windwardBlue text-white text-base font-bold active:opacity-80 mb-2 disabled:opacity-50"
            onClick={onInternetWind}
            disabled={internetBusy}
          >
            {internetBusy ? 'Загружаю…' : 'Получить ветер из интернета'}
          </button>

          {internetInfo && (
            <div className="text-committeeGreen text-sm mb-2">{internetInfo}</div>
          )}
          {internetError && (
            <div className="text-pinRed text-sm mb-2">{internetError}</div>
          )}

          {permState === 'denied' && (
            <div className="text-pinRed text-sm mb-2">
              Доступ к компасу запрещён. На iPhone: Настройки → Safari → Доступ к
              движению и ориентации.
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
              Компас не дал ни одного значения за {COMPASS_CAPTURE_MS}мс. Откалибруй
              компас (двигай телефон восьмёркой) и попробуй снова.
            </div>
          )}
          {headingNow !== null && (
            <div className="text-sm text-white/70">
              Снято с компаса: <b>{Math.round(headingNow)}°</b>
              {windAdjust !== 0 ? ` + коррекция ${windAdjust}° = ${Math.round((headingNow + windAdjust + 360) % 360)}°` : ''}
            </div>
          )}
          <div className="flex items-center gap-3 mt-3">
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
          {course?.windDirection !== null && course?.windDirection !== undefined ? (
            <div className="mt-2 text-base">
              Текущий ветер: <b>{Math.round(course.windDirection)}°</b>
            </div>
          ) : null}
          <div className="mt-2 text-[11px] text-white/50 leading-snug">
            TWD — направление откуда дует ветер (0°=север, 90°=восток, 180°=юг,
            270°=запад). Компас — самое точное; интернет — оценка из
            метеомодели Open-Meteo (нужны GPS или хотя бы одна точка).
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4">
          <button
            className="min-h-[56px] rounded-2xl bg-white/10 text-base font-bold"
            onClick={() => {
              newRace();
            }}
          >
            + Новая гонка
          </button>
          <button
            className="min-h-[56px] rounded-2xl bg-windwardBlue text-base font-bold"
            onClick={() => setDrawer(null)}
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}

/** Mean of an array of angles in degrees, robust to wrap at 0/360. */
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
