import { useEffect, useMemo, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Marker,
  Polyline,
  Popup,
  Tooltip,
  useMap,
  useMapEvent
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-rotate/dist/leaflet-rotate.js';
import { loadAudio } from '../db/persistence';
import { useSailingStore, type Course, type VoiceNote } from '../store/useSailingStore';
import * as orientation from '../services/orientation';
import type { LiveGps } from '../services/geolocation';
import {
  haversineDistance,
  initialBearing,
  ladderLines,
  laylines,
  midpoint,
  projectCoord,
  wrap360
} from '../math/sailing';

/**
 * Auto-fits the map bounds when course marks change, but stops doing so as
 * soon as the user pans or zooms. A "Recenter" button lets them re-enable
 * auto-fit on demand. The live GPS position is intentionally NOT a dependency
 * of fit — otherwise every GPS tick would yank the user's zoom level back.
 */
function FitBounds({
  course,
  live,
  liveKey,
  userInteracted,
  onUserInteract
}: {
  course: Course;
  live: LiveGps | null;
  /** 1 when we have a GPS fix, 0 when not — refits once when fix appears. */
  liveKey: number;
  userInteracted: boolean;
  onUserInteract: () => void;
}) {
  const map = useMap();

  // Stable signature for the marks only — live GPS does not invalidate it.
  const marksKey = useMemo(() => {
    const fmt = (c: { lat: number; lon: number } | null | undefined) =>
      c ? `${c.lat.toFixed(5)},${c.lon.toFixed(5)}` : '-';
    return `${fmt(course.pin)}|${fmt(course.committee)}|${fmt(course.windward)}`;
  }, [course.pin, course.committee, course.windward]);

  useMapEvent('zoomstart', onUserInteract);
  useMapEvent('dragstart', onUserInteract);

  useEffect(() => {
    if (userInteracted) return;
    const pts: [number, number][] = [];
    if (course.pin) pts.push([course.pin.lat, course.pin.lon]);
    if (course.committee) pts.push([course.committee.lat, course.committee.lon]);
    if (course.windward) pts.push([course.windward.lat, course.windward.lon]);
    if (live) pts.push([live.coord.lat, live.coord.lon]);
    if (pts.length === 0) return;
    if (pts.length >= 2) {
      map.fitBounds(pts, { padding: [50, 50], maxZoom: 17, animate: false });
    } else {
      map.setView(pts[0], 16, { animate: false });
    }
    // Refit when marks change, when user re-enables auto-fit, or when GPS
    // first appears (liveKey) so the boat is not left off-screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marksKey, userInteracted, liveKey]);

  return null;
}

/** Screen-relative heading: geographic minus current map bearing (leaflet-rotate). */
function boatIcon(headingDeg: number): L.DivIcon {
  // Yellow boat-shaped triangle. `headingDeg` is already relative to the
  // rotated map so the bow points the right way on screen.
  const html = `<div style="transform: rotate(${headingDeg}deg); width: 28px; height: 28px;">
    <svg viewBox="-12 -12 24 24" width="28" height="28">
      <circle cx="0" cy="0" r="11" fill="#06101C" stroke="#fff" stroke-width="1.5" opacity="0.8"/>
      <polygon points="0,-9 7,7 0,3 -7,7" fill="#FBBF24" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>
  </div>`;
  return L.divIcon({
    html,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });
}

function MapBearingSync({ bearingDeg }: { bearingDeg: number }) {
  const map = useMap();
  useEffect(() => {
    const m = map as L.Map;
    if (!m.options.rotate) return;
    m.setBearing(bearingDeg);
  }, [map, bearingDeg]);
  return null;
}

function VoiceNoteMapMarker({ note }: { note: VoiceNote }) {
  if (note.lat === null || note.lon === null) return null;
  return (
    <CircleMarker
      center={[note.lat, note.lon]}
      radius={12}
      pathOptions={{
        color: '#fff',
        weight: 3,
        fillColor: '#a855f7',
        fillOpacity: 0.95
      }}
    >
      <Popup className="voice-popup">
        <VoiceNotePopupBody note={note} />
      </Popup>
      <Tooltip direction="top" offset={[0, -6]}>
        🎤 нажми — слушать
      </Tooltip>
    </CircleMarker>
  );
}

function VoiceNotePopupBody({ note }: { note: VoiceNote }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let u: string | null = null;
    let cancelled = false;
    (async () => {
      const blob = await loadAudio(note.audioId);
      if (cancelled) return;
      if (!blob) {
        setErr('Запись не найдена');
        setLoading(false);
        return;
      }
      u = URL.createObjectURL(blob);
      setUrl(u);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
      if (u) URL.revokeObjectURL(u);
    };
  }, [note.audioId]);

  return (
    <div className="min-w-[220px] text-gray-900">
      <div className="text-sm font-bold mb-1">
        {new Date(note.ts).toLocaleString('ru-RU')}
      </div>
      <div className="text-xs text-gray-600 mb-2">
        {Math.round(note.durationMs / 1000)} с · голосовая метка
      </div>
      {loading && <div className="text-sm mb-2">Загружаю…</div>}
      {err && <div className="text-red-600 text-sm mb-2">{err}</div>}
      {url ? <audio controls src={url} className="w-full max-w-[280px]" preload="metadata" /> : null}
    </div>
  );
}

export function MapCanvas({ course, live }: { course: Course; live: LiveGps | null }) {
  const layLineDeg = useSailingStore((s) => s.settings.layLineDeg);
  const [userInteracted, setUserInteracted] = useState(false);

  // Subscribe to compass for the boat-icon heading. Falls back to the GPS
  // course-over-ground value when compass is silent (e.g. no permission
  // granted yet, or the device just doesn't have one).
  const [compassHeading, setCompassHeading] = useState<number | null>(null);
  // Always subscribe so we receive headings as soon as permission is granted
  // (e.g. after the user taps «компас» on the HUD).
  useEffect(() => {
    return orientation.subscribe((h) => setCompassHeading(h));
  }, []);
  const boatHeading =
    compassHeading ??
    live?.headingTrue ??
    null;

  async function requestCompassForBoat() {
    await orientation.requestPermission();
  }

  const initialCenter: [number, number] = useMemo(() => {
    if (course.pin && course.committee) {
      const m = midpoint(course.pin, course.committee);
      return [m.lat, m.lon];
    }
    if (live) return [live.coord.lat, live.coord.lon];
    return [43.7, 7.27];
    // Only used for the very first map mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Anchor for ladder lines: any course point or live GPS so «ступеньки» show
  // whenever TWD is known (not only after both line ends are set).
  const ladderAnchor = useMemo(() => {
    if (course.windward) return course.windward;
    if (course.pin && course.committee) return midpoint(course.pin, course.committee);
    if (course.pin) return course.pin;
    if (course.committee) return course.committee;
    if (live) return live.coord;
    return null;
  }, [
    course.pin,
    course.committee,
    course.windward,
    live?.coord.lat,
    live?.coord.lon
  ]);

  /** Rotate map: ВЕРХ (windward) строго вверх экрана; без верхнего — наветер по TWD. */
  const mapBearingDeg = useMemo(() => {
    if (course.windward) {
      if (course.pin && course.committee) {
        return initialBearing(
          midpoint(course.pin, course.committee),
          course.windward
        );
      }
      if (course.windDirection !== null) {
        const below = projectCoord(
          course.windward,
          course.windDirection + 180,
          250
        );
        return initialBearing(below, course.windward);
      }
      return 0;
    }
    if (course.windDirection !== null) return course.windDirection;
    return 0;
  }, [course.windward, course.pin, course.committee, course.windDirection]);

  const phoneHeadingForPanel = compassHeading ?? live?.headingTrue ?? null;
  const speedKmh =
    live && live.speedMps != null && live.speedMps >= 0
      ? (live.speedMps * 3.6).toFixed(1)
      : '—';

  // Approximate length scale — used to size the ladder rungs and laylines so
  // they always look right regardless of course size.
  const courseScale = useMemo(() => {
    if (course.pin && course.committee && course.windward) {
      const mid = midpoint(course.pin, course.committee);
      return Math.max(
        haversineDistance(course.pin, course.committee),
        haversineDistance(mid, course.windward)
      );
    }
    if (course.pin && course.committee) {
      return haversineDistance(course.pin, course.committee) * 2;
    }
    return 200;
  }, [course]);

  const ladders = useMemo(() => {
    if (course.windDirection === null || !ladderAnchor) return null;
    const step = Math.max(20, Math.round(courseScale * 0.18));
    const rungs = 11;
    const halfWidth = Math.max(courseScale * 0.7, step * 4);
    return ladderLines(
      ladderAnchor,
      course.windDirection,
      step,
      rungs,
      halfWidth
    );
  }, [course.windDirection, ladderAnchor, courseScale]);

  const layLines = useMemo(() => {
    if (course.windDirection === null || !course.windward) return null;
    const length = courseScale * 1.2;
    return laylines(course.windward, course.windDirection, layLineDeg, length);
  }, [course.windward, course.windDirection, layLineDeg, courseScale]);

  return (
    <div className="relative w-full h-full">
      <MapContainer
        center={initialCenter}
        zoom={15}
        className="w-full h-full rounded-2xl overflow-hidden"
        attributionControl={false}
        rotate
        bearing={mapBearingDeg}
        rotateControl={false}
        compassBearing={false}
        touchRotate={false}
        shiftKeyRotate={false}
      >
        <MapBearingSync bearingDeg={mapBearingDeg} />
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
          crossOrigin
        />
        <FitBounds
          course={course}
          live={live}
          liveKey={live ? 1 : 0}
          userInteracted={userInteracted}
          onUserInteract={() => setUserInteracted(true)}
        />

        {/* Ladder lines: thin parallel rungs perpendicular to the wind. The
            rung passing through windward (index 0) is highlighted. */}
        {ladders?.map((rung) => {
          const isCenter = rung.index === 0;
          return (
            <Polyline
              key={`ladder-${rung.index}`}
              positions={[
                [rung.a.lat, rung.a.lon],
                [rung.b.lat, rung.b.lon]
              ]}
              pathOptions={{
                color: isCenter ? '#FBBF24' : '#FFFFFF',
                weight: isCenter ? 2.5 : 2,
                opacity: isCenter ? 0.75 : 0.42,
                dashArray: isCenter ? undefined : '5 6',
                interactive: false
              }}
            />
          );
        })}

        {/* Layllines emanating from the windward mark. Inside this cone you
            can fetch the mark with one tack. */}
        {layLines && course.windward && (
          <>
            <Polyline
              positions={[
                [layLines.starboard.from.lat, layLines.starboard.from.lon],
                [layLines.starboard.to.lat, layLines.starboard.to.lon]
              ]}
              pathOptions={{
                color: '#2EA043',
                weight: 3,
                opacity: 0.85,
                dashArray: '8 8'
              }}
            >
              <Tooltip direction="center" offset={[0, 0]} sticky>
                лей-лайн правого галса
              </Tooltip>
            </Polyline>
            <Polyline
              positions={[
                [layLines.port.from.lat, layLines.port.from.lon],
                [layLines.port.to.lat, layLines.port.to.lon]
              ]}
              pathOptions={{
                color: '#D5302E',
                weight: 3,
                opacity: 0.85,
                dashArray: '8 8'
              }}
            >
              <Tooltip direction="center" offset={[0, 0]} sticky>
                лей-лайн левого галса
              </Tooltip>
            </Polyline>
          </>
        )}

        {/* Start line — thicker than before, with a subtle gradient using two
            half-segments so the favored side reads instantly. */}
        {course.pin && course.committee && (
          <>
            <Polyline
              positions={[
                [course.pin.lat, course.pin.lon],
                [
                  midpoint(course.pin, course.committee).lat,
                  midpoint(course.pin, course.committee).lon
                ]
              ]}
              pathOptions={{ color: '#D5302E', weight: 6, opacity: 0.95 }}
            />
            <Polyline
              positions={[
                [
                  midpoint(course.pin, course.committee).lat,
                  midpoint(course.pin, course.committee).lon
                ],
                [course.committee.lat, course.committee.lon]
              ]}
              pathOptions={{ color: '#2EA043', weight: 6, opacity: 0.95 }}
            />
          </>
        )}

        {course.pin && (
          <CircleMarker
            center={[course.pin.lat, course.pin.lon]}
            radius={14}
            pathOptions={{ color: '#fff', weight: 3, fillColor: '#D5302E', fillOpacity: 1 }}
          >
            <Tooltip direction="bottom" offset={[0, 8]} permanent>
              PIN
            </Tooltip>
          </CircleMarker>
        )}
        {course.committee && (
          <CircleMarker
            center={[course.committee.lat, course.committee.lon]}
            radius={14}
            pathOptions={{ color: '#fff', weight: 3, fillColor: '#2EA043', fillOpacity: 1 }}
          >
            <Tooltip direction="bottom" offset={[0, 8]} permanent>
              СУДЬЯ
            </Tooltip>
          </CircleMarker>
        )}
        {course.windward && (
          <CircleMarker
            center={[course.windward.lat, course.windward.lon]}
            radius={14}
            pathOptions={{ color: '#fff', weight: 3, fillColor: '#3B82F6', fillOpacity: 1 }}
          >
            <Tooltip direction="top" offset={[0, -8]} permanent>
              ВЕРХ
            </Tooltip>
          </CircleMarker>
        )}

        {live && (
          <>
            <CircleMarker
              center={[live.coord.lat, live.coord.lon]}
              radius={14}
              pathOptions={{
                color: '#fff',
                weight: 4,
                fillColor: '#FBBF24',
                fillOpacity: 1
              }}
            >
              <Tooltip direction="bottom" offset={[0, 8]}>
                ⚓ Вы (GPS ±{Math.round(live.accuracy)}м)
              </Tooltip>
            </CircleMarker>
            {boatHeading !== null ? (
              <Marker
                position={[live.coord.lat, live.coord.lon]}
                icon={boatIcon(wrap360(boatHeading - mapBearingDeg))}
                zIndexOffset={700}
              />
            ) : null}
          </>
        )}

        {/* Wind vector — a fat yellow arrow on the map showing where the
            wind comes from (tail) and where it's blowing to (head). Drawn
            through the ladder anchor so it stays inside the visible area. */}
        {course.windDirection !== null && ladderAnchor && (() => {
          const len = Math.max(80, courseScale * 0.45);
          const tail = projectCoord(ladderAnchor, course.windDirection, len * 0.6);
          const head = projectCoord(
            ladderAnchor,
            course.windDirection,
            -len * 0.6
          );
          const acrossAng = course.windDirection + 90;
          const headLeft = projectCoord(
            head,
            course.windDirection + 145,
            len * 0.18
          );
          const headRight = projectCoord(
            head,
            course.windDirection - 145,
            len * 0.18
          );
          // Use the across-wind direction to nudge the label off the shaft.
          const labelPt = projectCoord(ladderAnchor, acrossAng, len * 0.15);
          return (
            <>
              <Polyline
                positions={[
                  [tail.lat, tail.lon],
                  [head.lat, head.lon]
                ]}
                pathOptions={{ color: '#FBBF24', weight: 5, opacity: 0.9 }}
                interactive={false}
              />
              <Polyline
                positions={[
                  [headLeft.lat, headLeft.lon],
                  [head.lat, head.lon],
                  [headRight.lat, headRight.lon]
                ]}
                pathOptions={{ color: '#FBBF24', weight: 5, opacity: 0.9 }}
                interactive={false}
              />
              <CircleMarker
                center={[labelPt.lat, labelPt.lon]}
                radius={1}
                pathOptions={{ opacity: 0, fillOpacity: 0 }}
                interactive={false}
              >
                <Tooltip permanent direction="center" className="wind-label">
                  🌬 откуда {Math.round(course.windDirection)}° (куда дует — по стрелке)
                </Tooltip>
              </CircleMarker>
            </>
          );
        })()}

        {/* Current vector — drawn from the measurement origin in the direction
            the current is flowing. Length is scaled visually so even a tiny
            drift is visible on screen. */}
        {course.current && course.current.speedMps > 0.05 && (() => {
          const c = course.current;
          const arrowLen = Math.max(15, c.speedMps * 60);
          const tip = projectCoord(c.startCoord, c.setDirection, arrowLen);
          return (
            <Polyline
              positions={[
                [c.startCoord.lat, c.startCoord.lon],
                [tip.lat, tip.lon]
              ]}
              pathOptions={{ color: '#22d3ee', weight: 4, opacity: 0.9, dashArray: '6 6' }}
            >
              <Tooltip permanent direction="top" offset={[0, -4]}>
                течение {Math.round(c.setDirection)}° · {(c.speedMps * 1.94384).toFixed(2)} уз
              </Tooltip>
            </Polyline>
          );
        })()}

        {course.voiceNotes.map((n) => (
          <VoiceNoteMapMarker key={n.id} note={n} />
        ))}
      </MapContainer>

      <MapCompassPanel
        twd={course.windDirection}
        phoneHeadingDeg={phoneHeadingForPanel}
        speedKmh={speedKmh}
      />
      <MapLegend hasLayline={!!layLines} hasLadder={!!ladders} />

      {live ? (
        <BoatHud
          live={live}
          headingDeg={boatHeading}
          onRequestCompass={() => void requestCompassForBoat()}
        />
      ) : (
        <div
          className="absolute top-2 left-2 max-w-[min(200px,48vw)] rounded-xl bg-black/55 text-white text-[11px] px-2 py-1.5 leading-snug pointer-events-none"
          style={{ zIndex: 450 }}
        >
          Нет GPS. Разрешите геолокацию — тогда появитесь на карте.
        </div>
      )}

      {userInteracted && (
        <button
          type="button"
          className="absolute bottom-2 right-2 px-3 h-9 rounded-full bg-windwardBlue text-white text-xs font-bold shadow"
          style={{ zIndex: 410 }}
          onClick={() => setUserInteracted(false)}
        >
          ⤾ центрировать
        </button>
      )}
    </div>
  );
}

function BoatHud({
  live,
  headingDeg,
  onRequestCompass
}: {
  live: LiveGps;
  headingDeg: number | null;
  onRequestCompass: () => void;
}) {
  return (
    <div
      className="absolute top-2 left-2 rounded-xl bg-navyDeep/92 border border-white/20 px-2.5 py-2 shadow-lg pointer-events-none"
      style={{ zIndex: 450 }}
    >
      <div className="text-[10px] uppercase tracking-wide text-white/50">точность GPS</div>
      <div className="text-windYellow text-base font-black tabular-nums leading-none">
        ±{Math.round(live.accuracy)} м
      </div>
      {headingDeg === null ? (
        <button
          type="button"
          className="mt-1 w-full text-center text-[11px] font-bold text-cyan-300 active:opacity-70 pointer-events-auto touch-manipulation"
          onClick={onRequestCompass}
        >
          🧭 Разрешить компас
        </button>
      ) : null}
      <div className="text-[9px] text-white/40 mt-1 leading-tight">
        Курс и км/ч — справа вверху
      </div>
    </div>
  );
}

function MapCompassPanel({
  twd,
  phoneHeadingDeg,
  speedKmh
}: {
  twd: number | null;
  phoneHeadingDeg: number | null;
  speedKmh: string;
}) {
  const h = phoneHeadingDeg;
  return (
    <div
      className="absolute top-2 right-2 flex flex-col items-center rounded-2xl bg-navyDeep/92 border border-white/20 px-2.5 py-2 shadow-lg pointer-events-none min-w-[5.5rem]"
      style={{ zIndex: 450 }}
    >
      <div className="relative w-14 h-14 shrink-0">
        <svg viewBox="0 0 56 56" className="w-14 h-14" aria-hidden>
          <circle
            cx="28"
            cy="28"
            r="26"
            fill="none"
            stroke="rgba(255,255,255,0.35)"
            strokeWidth="1.5"
          />
          <text
            x="28"
            y="11"
            textAnchor="middle"
            fill="rgba(255,255,255,0.9)"
            fontSize="9"
            fontWeight="bold"
          >
            N
          </text>
          <text x="47" y="31" textAnchor="middle" fill="rgba(255,255,255,0.65)" fontSize="8">
            В
          </text>
          <text x="28" y="50" textAnchor="middle" fill="rgba(255,255,255,0.65)" fontSize="8">
            Ю
          </text>
          <text x="9" y="31" textAnchor="middle" fill="rgba(255,255,255,0.65)" fontSize="8">
            З
          </text>
          {h !== null ? (
            <g transform={`rotate(${h} 28 28)`}>
              <polygon
                points="28,8 23,28 33,28"
                fill="#FBBF24"
                stroke="#fff"
                strokeWidth="1"
              />
            </g>
          ) : null}
        </svg>
      </div>
      {twd !== null ? (
        <div className="text-[9px] text-windYellow font-extrabold tabular-nums leading-tight text-center mt-0.5">
          ветер {Math.round(twd)}° откуда
        </div>
      ) : (
        <div className="text-[9px] text-white/45 text-center mt-0.5">ветер не задан</div>
      )}
      <div className="text-[11px] font-bold text-white tabular-nums mt-1">
        тел. {h !== null ? `${Math.round(h)}°` : '—'}
      </div>
      <div className="text-sm font-black text-cyan-300 tabular-nums mt-0.5">
        {speedKmh}{' '}
        <span className="text-[10px] font-bold text-white/70">км/ч</span>
      </div>
    </div>
  );
}

function MapLegend({ hasLayline, hasLadder }: { hasLayline: boolean; hasLadder: boolean }) {
  if (!hasLayline && !hasLadder) return null;
  return (
    <div
      className="absolute bottom-2 left-2 bg-navyDeep/85 border border-white/10 rounded-xl px-2 py-1.5 text-[10px] leading-tight pointer-events-none"
      style={{ zIndex: 410 }}
    >
      {hasLadder && (
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-[2px] bg-white/60" /> ступеньки
          (одинаково от ветра)
        </div>
      )}
      {hasLayline && (
        <>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-[2px] border-t-2 border-dashed border-committeeGreen" />{' '}
            лей-лайн правого
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-[2px] border-t-2 border-dashed border-pinRed" />{' '}
            лей-лайн левого
          </div>
        </>
      )}
    </div>
  );
}

