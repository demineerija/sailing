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
import { pingProjected } from '../services/pingProjected';
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
  const newRace = useSailingStore((s) => s.newRace);
  const holdMs = useSailingStore((s) => s.settings.holdMs);
  const pingOffset = useSailingStore((s) => s.settings.pingAtDistanceMeters);

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
    <div className="h-full flex flex-col safe-top safe-bottom min-h-0">
      {/* Top bar */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 bg-navyDeep border-b border-white/5 shrink-0">
        <button
          className="min-w-[44px] h-11 rounded-xl bg-white/10 text-xl"
          onClick={() => setDrawer('settings')}
          aria-label="меню"
        >
          ≡
        </button>
        <MarkChip mark="pin" emoji="📍" color="text-pinRed" pingedAt={course.pin?.ts ?? null} holdMs={holdMs} offsetMeters={pingOffset} onRePing={(c, a) => pingMark('pin', c, a)} />
        <MarkChip mark="committee" emoji="🚩" color="text-committeeGreen" pingedAt={course.committee?.ts ?? null} holdMs={holdMs} offsetMeters={pingOffset} onRePing={(c, a) => pingMark('committee', c, a)} />
        <MarkChip mark="windward" emoji="🔺" color="text-windwardBlue" pingedAt={course.windward?.ts ?? null} holdMs={holdMs} offsetMeters={pingOffset} onRePing={(c, a) => pingMark('windward', c, a)} />
        <FreshChip emoji="🌬" pingedAt={course.windSetAt ?? null} />
        <div className="ml-auto flex bg-white/10 rounded-xl overflow-hidden">
          <button
            className={`h-11 px-2.5 text-sm ${viewMode === 'schema' ? 'bg-windwardBlue' : ''}`}
            onClick={() => setViewMode('schema')}
          >
            Сх
          </button>
          <button
            className={`h-11 px-2.5 text-sm ${viewMode === 'map' ? 'bg-windwardBlue' : ''}`}
            onClick={() => setViewMode('map')}
          >
            Карт
          </button>
        </div>
      </div>

      {/* Verdict + skew compact strip */}
      <div className="px-3 pt-2 shrink-0">
        {hasLine && calc?.bias ? (
          <BiasVerdict bias={calc.bias} skew={calc?.skew ?? null} />
        ) : (
          <NoLineCta />
        )}
      </div>

      {/* Canvas (flex-shrinkable) */}
      <div className="flex-1 min-h-[120px] px-2 pt-1.5">
        <div className="w-full h-full bg-navyDeep rounded-2xl overflow-hidden">
          {viewMode === 'schema' ? (
            <SchemaCanvas course={course} />
          ) : (
            <MapCanvas course={course} live={live} />
          )}
        </div>
      </div>

      {/* Warnings — only when present, single line on phones */}
      {calc?.warnings && calc.warnings.length > 0 ? (
        <div className="px-3 pt-1 text-xs text-windYellow truncate shrink-0">
          {calc.warnings.map((w, i) => (
            <div key={i} className="truncate">⚠ {warningText(w)}</div>
          ))}
        </div>
      ) : null}

      {/* Bottom action strip — all main buttons in one shrink-0 area */}
      <div className="grid grid-cols-3 gap-1.5 p-2 shrink-0">
        <TimerCompact />
        <button
          type="button"
          className="min-h-[64px] rounded-2xl bg-navyDeep flex flex-col items-center justify-center active:opacity-80"
          onClick={() => setDrawer('wind')}
        >
          <div className="text-2xl font-black tabular-nums text-windYellow leading-none">
            {course.windDirection !== null ? `${Math.round(course.windDirection)}°` : '—'}
          </div>
          <div className="text-[10px] text-white/60 mt-1">ветер TWD</div>
        </button>
        <button
          type="button"
          className="min-h-[64px] rounded-2xl bg-navyDeep flex flex-col items-center justify-center active:opacity-80"
          onClick={() => setDrawer('history')}
        >
          <div className="text-base font-bold tabular-nums leading-tight">
            {calc?.distLine !== null && calc?.distLine !== undefined ? `${Math.round(calc.distLine)}м` : '—'}
            {calc?.ttb !== null && calc?.ttb !== undefined ? ` · ${Math.round(calc.ttb)}с` : ''}
          </div>
          <div className="text-[10px] text-white/60 mt-0.5">до линии</div>
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1.5 px-2 shrink-0">
        <button
          className="min-h-[44px] rounded-xl bg-windYellow text-navy text-sm font-bold flex items-center justify-center gap-1"
          onClick={() => setDrawer('wind')}
          title="Указать ветер"
        >
          🌬 Ветер
        </button>
        <button
          className="min-h-[44px] rounded-xl bg-pinRed/90 text-sm font-bold flex items-center justify-center gap-1"
          onClick={() => setDrawer('voice')}
          title="Голосовая метка"
        >
          🎤 Голос
        </button>
        <button
          className="min-h-[44px] rounded-xl bg-cyan-500/90 text-navy text-sm font-bold flex items-center justify-center gap-1"
          onClick={() => setDrawer('drift')}
          title="Замер течения"
        >
          ⛵ Течение
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1.5 px-2 pt-1.5 pb-2 shrink-0">
        <button
          className="min-h-[44px] rounded-2xl bg-white/10 text-base font-bold"
          onClick={() => setDrawer('setup')}
        >
          Постановка
        </button>
        <button
          className="min-h-[44px] rounded-2xl bg-windwardBlue text-base font-bold"
          onClick={() => newRace()}
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
      className="w-full min-h-[72px] rounded-2xl bg-windwardBlue text-xl font-extrabold"
      onClick={() => setDrawer('setup')}
    >
      Поставить линию
    </button>
  );
}

function BiasVerdict({
  bias,
  skew
}: {
  bias: ReturnType<typeof computeLineBias>;
  skew: ReturnType<typeof computeCourseSkew> | null;
}) {
  const isNeutral = bias.favored === 'neutral';
  const isPin = bias.favored === 'pin';
  const arrow = isNeutral ? '·' : isPin ? '←' : '→';
  const color = isNeutral
    ? 'text-white/70'
    : isPin
    ? 'text-pinRed'
    : 'text-committeeGreen';
  const label = isNeutral
    ? 'ЛИНИЯ РОВНАЯ'
    : `${isPin ? 'PIN' : 'СУДЬЯ'} ВЫГОДНЕЕ`;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center justify-center gap-3 leading-none">
        <div className={`text-5xl ${color}`}>{arrow}</div>
        <div className={`text-xl font-extrabold ${color} tracking-tight`}>{label}</div>
        {!isNeutral && (
          <div className="text-base tabular-nums text-white/80">
            {Math.round(Math.abs(bias.degrees))}° · +{Math.round(bias.advantageMeters)}м
          </div>
        )}
      </div>
      {skew ? (
        <div
          className={`text-sm font-bold tracking-wide ${
            skew.favored === 'starboard'
              ? 'text-committeeGreen'
              : skew.favored === 'port'
              ? 'text-pinRed'
              : 'text-white/60'
          }`}
        >
          {skew.favored === 'starboard'
            ? `ДИСТАНЦИЯ: ПРАВО +${Math.round(Math.abs(skew.degrees))}°`
            : skew.favored === 'port'
            ? `ДИСТАНЦИЯ: ЛЕВО +${Math.round(Math.abs(skew.degrees))}°`
            : 'ДИСТАНЦИЯ РОВНАЯ'}
        </div>
      ) : null}
    </div>
  );
}

function MarkChip({
  mark,
  emoji,
  color,
  pingedAt,
  holdMs,
  offsetMeters,
  onRePing
}: {
  mark: MarkKey;
  emoji: string;
  color: string;
  pingedAt: number | null;
  holdMs: number;
  offsetMeters: number;
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
      const r = await pingProjected(holdMs, offsetMeters);
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
      className="relative min-w-[48px] h-11 rounded-xl bg-white/5 px-1.5 flex flex-col items-center justify-center select-none touch-manipulation overflow-hidden"
      onPointerDown={begin}
      onPointerUp={end}
      onPointerLeave={end}
      onPointerCancel={end}
      title={`${mark} (long-press = re-ping)`}
    >
      <div className="absolute inset-0 bg-white/20 origin-left" style={{ transform: `scaleX(${progress})` }} />
      <div className={`relative z-10 text-lg ${color} leading-none`}>{emoji}</div>
      <div className="relative z-10 text-[9px] text-white/70 leading-none mt-0.5">
        {pingedAt ? formatAgo(Date.now() - pingedAt) : '—'}
      </div>
    </div>
  );
}

function FreshChip({ emoji, pingedAt }: { emoji: string; pingedAt: number | null }) {
  return (
    <div className="min-w-[48px] h-11 rounded-xl bg-white/5 px-1.5 flex flex-col items-center justify-center">
      <div className="text-lg leading-none">{emoji}</div>
      <div className="text-[9px] text-white/70 leading-none mt-0.5">{pingedAt ? formatAgo(Date.now() - pingedAt) : '—'}</div>
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
      return `линия короткая (${Math.round(w.meters ?? 0)}м), GPS-шум`;
    case 'biasNearlyAlongLine':
      return `ветер почти вдоль линии (${Math.round(w.degrees ?? 0)}°)`;
    case 'windwardNotUpwind':
      return 'верхний буй не наветру? Проверь точки';
    default:
      return '';
  }
}
