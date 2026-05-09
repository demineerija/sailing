import { useEffect, useMemo } from 'react';
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Polyline,
  Tooltip,
  useMap
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useSailingStore, type Course } from '../store/useSailingStore';
import type { LiveGps } from '../services/geolocation';
import {
  haversineDistance,
  ladderLines,
  laylines,
  midpoint,
  projectCoord
} from '../math/sailing';

function FitBounds({ course, live }: { course: Course; live: LiveGps | null }) {
  const map = useMap();
  useEffect(() => {
    const pts: [number, number][] = [];
    if (course.pin) pts.push([course.pin.lat, course.pin.lon]);
    if (course.committee) pts.push([course.committee.lat, course.committee.lon]);
    if (course.windward) pts.push([course.windward.lat, course.windward.lon]);
    if (live) pts.push([live.coord.lat, live.coord.lon]);
    if (pts.length >= 2) {
      map.fitBounds(pts, { padding: [40, 40], maxZoom: 17 });
    } else if (pts.length === 1) {
      map.setView(pts[0], 16);
    }
  }, [map, course, live]);
  return null;
}

export function MapCanvas({ course, live }: { course: Course; live: LiveGps | null }) {
  const layLineDeg = useSailingStore((s) => s.settings.layLineDeg);

  const center: [number, number] = useMemo(() => {
    if (course.pin && course.committee) {
      const m = midpoint(course.pin, course.committee);
      return [m.lat, m.lon];
    }
    if (live) return [live.coord.lat, live.coord.lon];
    return [43.7, 7.27];
  }, [course, live]);

  // Anchor for the ladder = windward mark when present, otherwise the line
  // midpoint. The ladder always tracks the wind, so it works the moment we
  // know TWD, even before the windward mark is set.
  const ladderAnchor = useMemo(() => {
    if (course.windward) return course.windward;
    if (course.pin && course.committee) return midpoint(course.pin, course.committee);
    return null;
  }, [course.pin, course.committee, course.windward]);

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
    return ladderLines(ladderAnchor, course.windDirection, step, rungs, halfWidth);
  }, [course.windDirection, ladderAnchor, courseScale]);

  const layLines = useMemo(() => {
    if (course.windDirection === null || !course.windward) return null;
    const length = courseScale * 1.2;
    return laylines(course.windward, course.windDirection, layLineDeg, length);
  }, [course.windward, course.windDirection, layLineDeg, courseScale]);

  return (
    <div className="relative w-full h-full">
      <MapContainer
        center={center}
        zoom={15}
        className="w-full h-full rounded-2xl overflow-hidden"
        preferCanvas
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
          crossOrigin
        />
        <FitBounds course={course} live={live} />

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
                weight: isCenter ? 2 : 1,
                opacity: isCenter ? 0.65 : 0.18,
                dashArray: isCenter ? undefined : '4 6',
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
          <CircleMarker
            center={[live.coord.lat, live.coord.lon]}
            radius={8}
            pathOptions={{ color: '#fff', weight: 2, fillColor: '#FBBF24', fillOpacity: 1 }}
          />
        )}

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

        {/* Voice notes — purple circles with a tooltip for the recorded time. */}
        {course.voiceNotes.map((n) =>
          n.lat !== null && n.lon !== null ? (
            <CircleMarker
              key={n.id}
              center={[n.lat, n.lon]}
              radius={7}
              pathOptions={{ color: '#fff', weight: 2, fillColor: '#a855f7', fillOpacity: 0.95 }}
            >
              <Tooltip direction="top" offset={[0, -4]}>
                🎤 {new Date(n.ts).toLocaleTimeString('ru-RU')}
              </Tooltip>
            </CircleMarker>
          ) : null
        )}
      </MapContainer>

      <WindRose direction={course.windDirection} />
      <MapLegend hasLayline={!!layLines} hasLadder={!!ladders} />
    </div>
  );
}

function WindRose({ direction }: { direction: number | null }) {
  if (direction === null) return null;
  // Rotate the arrow so it points in the direction the wind is *blowing
  // toward* (downwind). That matches an aircraft-style wind sock visual.
  const rotation = (direction + 180) % 360;
  return (
    <div
      className="absolute top-2 right-2 w-16 h-16 rounded-full bg-navyDeep/85 border border-white/20 flex items-center justify-center pointer-events-none drawer-overlay"
      style={{ zIndex: 410 }}
      title={`ветер ${Math.round(direction)}° (откуда)`}
    >
      <div className="text-[10px] absolute top-1 left-0 right-0 text-center text-white/60">N</div>
      <div
        className="text-windYellow text-3xl leading-none"
        style={{ transform: `rotate(${rotation}deg)` }}
      >
        ↓
      </div>
      <div className="absolute bottom-0 left-0 right-0 text-center text-[10px] text-windYellow font-bold">
        {Math.round(direction)}°
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

