import { useEffect, useMemo, useRef, useState } from 'react';
import {
  computeCourseSkew,
  computeLineBias,
  distanceToSegment,
  haversineDistance,
  initialBearing,
  midpoint,
  sanityWarnings,
  timeToBurnSeconds
} from '../math/sailing';
import { selectCurrentCourse, useSailingStore, type MarkKey } from '../store/useSailingStore';
import * as wakeLock from '../services/wakeLock';
import { pingWithAveraging } from '../services/geolocation';
import { SchemaCanvas } from './SchemaCanvas';
import { MapCanvas } from './MapCanvas';
import { TimerCompact } from './TimerView';

export function LiveDashboard() {
  const course = useSailingStore(selectCurrentCourse);
  const live = useSailingStore((s) => s.liveGps);
  const viewMode = useSailingStore((s) => s.viewMode);
  const setViewMode = useSailingStore((s) => s.setViewMode);
  const setDrawer = useSailingStore((s) => s.setDrawer);
  const pingMark = useSailingStore((s) => s.pingMark);
  const holdMs = useSailingStore((s) => s.settings.holdMs);

  useEffect(() => {
    void wakeLock.acquire();
    return () => {
      void wakeLock.release();
    };
  }, []);

  const calc = useMemo(() => {
    if (!course?.pin || !course?.committee) return null;
    const lineBearing = initialBearing(course.pin, course.committee);
    const lineLength = haversineDistance(course.pin, course.committee);
    const mid = midpoint(course.pin, course.committee);
    const bias =
      course.windDirection !== null
        ? computeLineBias(lineBearing, course.windDirection, lineLength)
        : null;
    let skew = null;
    if (course.windward && course.windDirection !== null) {
      const courseAxis = initialBearing(mid, course.windward);
      skew = computeCourseSkew(courseAxis, course.windDirection, lineLength);
    }
    const distLine = live ? distanceToSegment(live.coord, course.pin, course.committee) : null;
    const ttb = distLine !== null && live?.speedMps != null ? timeToBurnSeconds(distLine, live.speedMps) : null;
    const warnings =
      bias !== null
        ? sanityWarnings(course.pin, course.committee, course.windward, course.windDirection ?? 0, bias)
        : [];
    return { lineBearing, lineLength, bias, skew, distLine, ttb, warnings };
  }, [course, live]);

  if (!course) return null;
  const hasLine = !!course.pin && !!course.committee;

  return (
    <div className="h-full flex flex-col safe-top safe-bottom">
      {/* Top bar */}
      <div className="flex items-center gap-2 p-2 bg-navyDeep border-b border-white/5">
        <button
          className="min-w-[56px] min-h-[56px] rounded-xl bg-white/10 text-2xl"
          onClick={() => setDrawer('settings')}
          aria-label="меню"
        >
          ≡
        </button>
        <MarkChip mark="pin" emoji="📍" color="text-pinRed" pingedAt={course.pin?.ts ?? null} holdMs={holdMs} onRePing={(c, a) => pingMark('pin', c, a)} />
        <MarkChip mark="committee" emoji="🚩" color="text-committeeGreen" pingedAt={course.committee?.ts ?? null} holdMs={holdMs} onRePing={(c, a) => pingMark('committee', c, a)} />
        <MarkChip mark="windward" emoji="🔺" color="text-windwardBlue" pingedAt={course.windward?.ts ?? null} holdMs={holdMs} onRePing={(c, a) => pingMark('windward', c, a)} />
        <FreshChip emoji="🌬" pingedAt={course.windSetAt ?? null} />
        <div className="ml-auto flex bg-white/10 rounded-xl overflow-hidden">
          <button
            className={`min-h-[44px] px-3 ${viewMode === 'schema' ? 'bg-windwardBlue' : ''}`}
            onClick={() => setViewMode('schema')}
          >
            Сх
          </button>
          <button
            className={`min-h-[44px] px-3 ${viewMode === 'map' ? 'bg-windwardBlue' : ''}`}
            onClick={() => setViewMode('map')}
          >
            Карт
          </button>
        </div>
      </div>

      {/* Verdict */}
      <div className="px-4 pt-3">
        {hasLine && calc?.bias ? <BiasVerdict bias={calc.bias} /> : <NoLineCta />}
      </div>

      {/* Canvas */}
      <div className="flex-1 px-3 pt-2">
        <div className="w-full h-full bg-navyDeep rounded-2xl overflow-hidden">
          {viewMode === 'schema' ? (
            <SchemaCanvas course={course} />
          ) : (
            <MapCanvas course={course} live={live} />
          )}
        </div>
      </div>

      {/* Course skew */}
      {calc?.skew ? (
        <div className="px-4 py-2 text-center">
          <span
            className={`text-2xl font-extrabold ${
              calc.skew.favored === 'starboard'
                ? 'text-committeeGreen'
                : calc.skew.favored === 'port'
                ? 'text-pinRed'
                : 'text-white/60'
            }`}
          >
            {calc.skew.favored === 'starboard'
              ? `ДИСТАНЦИЯ: ПРАВО +${Math.round(Math.abs(calc.skew.degrees))}°`
              : calc.skew.favored === 'port'
              ? `ДИСТАНЦИЯ: ЛЕВО +${Math.round(Math.abs(calc.skew.degrees))}°`
              : 'ДИСТАНЦИЯ РОВНАЯ'}
          </span>
        </div>
      ) : null}

      {/* Warnings */}
      {calc?.warnings && calc.warnings.length > 0 ? (
        <div className="px-4 pb-2 text-sm text-windYellow">
          {calc.warnings.map((w, i) => (
            <div key={i}>⚠ {warningText(w)}</div>
          ))}
        </div>
      ) : null}

      {/* Bottom strip */}
      <div className="grid grid-cols-3 gap-2 p-2">
        <TimerCompact />
        <button
          type="button"
          className="min-h-[88px] rounded-2xl bg-navyDeep flex flex-col items-center justify-center active:opacity-80"
          onClick={() => setDrawer('wind')}
        >
          <div className="text-3xl font-black tabular-nums text-windYellow">
            {course.windDirection !== null ? `${Math.round(course.windDirection)}°` : '—'}
          </div>
          <div className="text-xs text-white/60">ветер TWD</div>
        </button>
        <button
          type="button"
          className="min-h-[88px] rounded-2xl bg-navyDeep flex flex-col items-center justify-center active:opacity-80"
          onClick={() => setDrawer('history')}
        >
          <div className="text-2xl font-bold tabular-nums">
            {calc?.distLine !== null && calc?.distLine !== undefined ? `${Math.round(calc.distLine)}м` : '—'}
            {calc?.ttb !== null && calc?.ttb !== undefined ? ` · ${Math.round(calc.ttb)}с` : ''}
          </div>
          <div className="text-xs text-white/60">до линии</div>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 px-2 pb-2">
        <button
          className="min-h-[64px] rounded-2xl bg-white/10 text-lg font-bold"
          onClick={() => setDrawer('setup')}
        >
          Постановка
        </button>
        <button
          className="min-h-[64px] rounded-2xl bg-windwardBlue text-lg font-bold"
          onClick={() => useSailingStore.getState().newRace()}
        >
          + Новая гонка
        </button>
      </div>
    </div>
  );
}

function NoLineCta() {
  const setDrawer = useSailingStore((s) => s.setDrawer);
  return (
    <button
      className="w-full min-h-[88px] rounded-2xl bg-windwardBlue text-2xl font-extrabold"
      onClick={() => setDrawer('setup')}
    >
      Поставить линию
    </button>
  );
}

function BiasVerdict({ bias }: { bias: ReturnType<typeof computeLineBias> }) {
  if (bias.favored === 'neutral') {
    return (
      <div className="text-center text-white/80">
        <div className="text-2xl font-bold">ЛИНИЯ РОВНАЯ</div>
        <div className="text-sm">|bias| &lt; 1.5°</div>
      </div>
    );
  }
  const isPin = bias.favored === 'pin';
  return (
    <div className="flex items-center justify-center gap-3">
      <div className={`text-7xl ${isPin ? 'text-pinRed' : 'text-committeeGreen'}`}>
        {isPin ? '←' : '→'}
      </div>
      <div className="leading-tight">
        <div className={`text-3xl font-extrabold ${isPin ? 'text-pinRed' : 'text-committeeGreen'}`}>
          {isPin ? 'PIN' : 'СУДЬЯ'} ВЫГОДНЕЕ
        </div>
        <div className="text-xl tabular-nums">
          {Math.round(Math.abs(bias.degrees))}° · +{Math.round(bias.advantageMeters)} м
        </div>
      </div>
    </div>
  );
}

function MarkChip({
  mark,
  emoji,
  color,
  pingedAt,
  holdMs,
  onRePing
}: {
  mark: MarkKey;
  emoji: string;
  color: string;
  pingedAt: number | null;
  holdMs: number;
  onRePing: (coord: { lat: number; lon: number }, accuracy?: number) => void;
}) {
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const rafRef = useRef<number | null>(null);
  const start = useRef(0);
  const cancelled = useRef(false);

  const tick = () => {
    const e = performance.now() - start.current;
    const p = Math.min(1, e / holdMs);
    setProgress(p);
    if (p < 1 && !cancelled.current) rafRef.current = requestAnimationFrame(tick);
  };

  const begin = async () => {
    if (busy) return;
    cancelled.current = false;
    setBusy(true);
    setProgress(0);
    start.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
    try {
      const r = await pingWithAveraging(holdMs);
      if (!cancelled.current) onRePing(r.coord, r.accuracy);
    } catch {
      // swallow — quick re-ping should fail silently in top bar
    } finally {
      setBusy(false);
      setProgress(0);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    }
  };

  const end = () => {
    cancelled.current = true;
    setBusy(false);
    setProgress(0);
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  };

  return (
    <div
      className="relative min-w-[64px] min-h-[56px] rounded-xl bg-white/5 px-2 flex flex-col items-center justify-center select-none touch-manipulation overflow-hidden"
      onPointerDown={begin}
      onPointerUp={end}
      onPointerLeave={end}
      onPointerCancel={end}
      title={`${mark} (long-press = re-ping)`}
    >
      <div className="absolute inset-0 bg-white/20 origin-left" style={{ transform: `scaleX(${progress})` }} />
      <div className={`relative z-10 text-2xl ${color}`}>{emoji}</div>
      <div className="relative z-10 text-[10px] text-white/70">
        {pingedAt ? formatAgo(Date.now() - pingedAt) : '—'}
      </div>
    </div>
  );
}

function FreshChip({ emoji, pingedAt }: { emoji: string; pingedAt: number | null }) {
  return (
    <div className="min-w-[64px] min-h-[56px] rounded-xl bg-white/5 px-2 flex flex-col items-center justify-center">
      <div className="text-2xl">{emoji}</div>
      <div className="text-[10px] text-white/70">{pingedAt ? formatAgo(Date.now() - pingedAt) : '—'}</div>
    </div>
  );
}

function formatAgo(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}с`;
  const m = Math.round(s / 60);
  return `${m}мин`;
}

function warningText(w: { type: string; meters?: number; degrees?: number }): string {
  switch (w.type) {
    case 'lineTooShort':
      return `линия короткая (${Math.round(w.meters ?? 0)}м), GPS-шум превышает разницу`;
    case 'biasNearlyAlongLine':
      return `ветер почти вдоль линии (${Math.round(w.degrees ?? 0)}°), расчёт нестабилен`;
    case 'windwardNotUpwind':
      return 'верхний буй не наветру? Проверь точки';
    default:
      return '';
  }
}
