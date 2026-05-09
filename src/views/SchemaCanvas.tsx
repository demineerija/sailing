import { useMemo } from 'react';
import {
  computeCourseSkew,
  computeLineBias,
  haversineDistance,
  initialBearing,
  midpoint
} from '../math/sailing';
import { useSailingStore, type Course } from '../store/useSailingStore';

type Props = { course: Course };

/**
 * Abstract triangle visualization. Uses local-tangent x/y coordinates around
 * the course centroid; not a map projection — just enough to render layout.
 */
export function SchemaCanvas({ course }: Props) {
  const layLineDeg = useSailingStore((s) => s.settings.layLineDeg);
  const data = useMemo(() => {
    if (!course.pin || !course.committee) return null;
    const lineBearing = initialBearing(course.pin, course.committee);
    const lineLength = haversineDistance(course.pin, course.committee);
    const mid = midpoint(course.pin, course.committee);
    let courseAxis: number | null = null;
    if (course.windward) {
      courseAxis = initialBearing(mid, course.windward);
    }
    const bias = course.windDirection !== null
      ? computeLineBias(lineBearing, course.windDirection, lineLength)
      : null;
    const skew =
      courseAxis !== null && course.windDirection !== null
        ? computeCourseSkew(courseAxis, course.windDirection, lineLength)
        : null;
    return { lineBearing, lineLength, courseAxis, bias, skew };
  }, [course]);

  if (!data || !course.pin || !course.committee) {
    return (
      <div className="h-full flex items-center justify-center text-white/60">
        Поставьте PIN и СУДЬЯ
      </div>
    );
  }

  const W = 600;
  const H = 600;
  const cx = W / 2;
  const lineY = H * 0.82; // line near the bottom
  const topPad = 70; // breathing room for ВЕРХ label and wind arrow
  const sidePad = 60;

  // Real-world distances in metres.
  const lineLength = data.lineLength;
  const skewDeg = data.skew?.degrees ?? 0;
  const distanceToWindward = course.windward
    ? haversineDistance(midpoint(course.pin, course.committee), course.windward)
    : lineLength * 3;

  // Pick a single uniform pixels-per-metre scale that fits BOTH the line
  // (constrained by canvas width) AND the windward distance (constrained by
  // available vertical room above the line). Cap the line at ~70% of width.
  const maxLinePx = (W - 2 * sidePad) * 0.95;
  const maxWindwardPx = lineY - topPad;
  const ppmFromLine = maxLinePx / Math.max(lineLength, 1);
  const ppmFromWindward = maxWindwardPx / Math.max(distanceToWindward, 1);
  const ppm = Math.min(ppmFromLine, ppmFromWindward);
  const halfLine = (lineLength * ppm) / 2;
  const wWY = lineY - distanceToWindward * ppm;
  const wWX = cx + Math.tan((skewDeg * Math.PI) / 180) * (lineY - wWY);

  const twd = course.windDirection;
  // Schema coords: North = "up" (i.e. line normal). The schema is rotated so
  // the line is always drawn horizontally; ladder rungs and laylines must
  // therefore be tilted by `twd - lineNormal = twd - (lineBearing - 90)`.
  const lineNormalDeg = (data.lineBearing - 90 + 360) % 360;
  const tiltDeg = twd !== null ? ((twd - lineNormalDeg + 540) % 360) - 180 : 0;
  const tiltRad = (tiltDeg * Math.PI) / 180;

  // Ladder spacing is half the screen distance between line and windward.
  const ladderStep = course.windward ? Math.max(28, (lineY - wWY) / 5) : 60;
  const ladderHalfWidth = Math.max(halfLine * 1.6, W * 0.55);

  const ladderRungs = twd !== null
    ? buildSchemaLadder({
        anchorX: course.windward ? wWX : cx,
        anchorY: course.windward ? wWY : lineY,
        tiltRad,
        step: ladderStep,
        rungs: 11,
        halfWidth: ladderHalfWidth,
        clipMaxY: H + 50,
        clipMinY: -50
      })
    : [];

  // Laylines from the windward mark, ±laylineDeg from downwind.
  // In schema coords downwind is "down" (positive Y) so we draw two lines
  // from windward into the lower half of the canvas.
  const laylineLen = Math.max(lineY * 1.4, 600);
  const laylinePort = course.windward && twd !== null
    ? rotatedPoint(wWX, wWY, tiltDeg + 180 + layLineDeg, laylineLen)
    : null;
  const laylineStb = course.windward && twd !== null
    ? rotatedPoint(wWX, wWY, tiltDeg + 180 - layLineDeg, laylineLen)
    : null;

  const windDirRad = ((course.windDirection ?? 0) * Math.PI) / 180;
  // Wind arrow points from where it comes from. In schema coords, north = up.
  // Arrow drawn near windward mark.
  const ax = wWX + Math.sin(windDirRad) * 80;
  const ay = wWY - Math.cos(windDirRad) * 80;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-full"
      preserveAspectRatio="xMidYMid meet"
    >
      <rect width={W} height={H} fill="#06101C" rx={20} />

      {/* Ladder rungs — drawn first so everything else sits on top. */}
      {ladderRungs.map((r, i) => (
        <line
          key={`rung-${i}`}
          x1={r.x1}
          y1={r.y1}
          x2={r.x2}
          y2={r.y2}
          stroke={r.center ? '#FBBF24' : '#FFFFFF'}
          strokeWidth={r.center ? 2 : 1}
          strokeOpacity={r.center ? 0.6 : 0.18}
          strokeDasharray={r.center ? undefined : '4 6'}
        />
      ))}

      {/* Laylines (port = red, starboard = green) */}
      {course.windward && laylinePort && laylineStb && (
        <>
          <line
            x1={wWX}
            y1={wWY}
            x2={laylinePort.x}
            y2={laylinePort.y}
            stroke="#D5302E"
            strokeWidth={3}
            strokeOpacity={0.85}
            strokeDasharray="8 8"
          />
          <line
            x1={wWX}
            y1={wWY}
            x2={laylineStb.x}
            y2={laylineStb.y}
            stroke="#2EA043"
            strokeWidth={3}
            strokeOpacity={0.85}
            strokeDasharray="8 8"
          />
        </>
      )}

      {/* Course axis (mid → windward) */}
      {course.windward && (
        <line
          x1={cx}
          y1={lineY}
          x2={wWX}
          y2={wWY}
          stroke="#FFFFFF22"
          strokeWidth={3}
          strokeDasharray="6 6"
        />
      )}

      {/* Start line — gradient red→green */}
      <defs>
        <linearGradient id="lineGrad" x1="0%" x2="100%">
          <stop offset="0%" stopColor="#D5302E" />
          <stop offset="100%" stopColor="#2EA043" />
        </linearGradient>
        <marker id="windArrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#FBBF24" />
        </marker>
      </defs>

      <line
        x1={cx - halfLine}
        y1={lineY}
        x2={cx + halfLine}
        y2={lineY}
        stroke="url(#lineGrad)"
        strokeWidth={10}
        strokeLinecap="round"
      />

      {/* PIN */}
      <circle cx={cx - halfLine} cy={lineY} r={26} fill="#D5302E" stroke="#fff" strokeWidth={4} />
      <text x={cx - halfLine} y={lineY + 60} textAnchor="middle" fill="#fff" fontSize="22" fontWeight="bold">
        PIN
      </text>

      {/* COMMITTEE */}
      <rect
        x={cx + halfLine - 24}
        y={lineY - 18}
        width={48}
        height={36}
        fill="#2EA043"
        stroke="#fff"
        strokeWidth={4}
      />
      <text x={cx + halfLine} y={lineY + 60} textAnchor="middle" fill="#fff" fontSize="22" fontWeight="bold">
        СУДЬЯ
      </text>

      {/* WINDWARD */}
      {course.windward && (
        <>
          <polygon
            points={`${wWX},${wWY - 30} ${wWX - 26},${wWY + 18} ${wWX + 26},${wWY + 18}`}
            fill="#3B82F6"
            stroke="#fff"
            strokeWidth={4}
          />
          <text x={wWX} y={wWY - 42} textAnchor="middle" fill="#fff" fontSize="20" fontWeight="bold">
            ВЕРХ
          </text>
        </>
      )}

      {/* Wind arrow */}
      {course.windDirection !== null && course.windward && (
        <g>
          <line
            x1={ax}
            y1={ay}
            x2={wWX}
            y2={wWY}
            stroke="#FBBF24"
            strokeWidth={6}
            markerEnd="url(#windArrow)"
          />
          <text x={ax} y={ay - 10} textAnchor="middle" fill="#FBBF24" fontSize="20" fontWeight="bold">
            {Math.round(course.windDirection)}°
          </text>
        </g>
      )}

      {/* Bias label */}
      {data.bias && data.bias.favored !== 'neutral' && (
        <text
          x={cx}
          y={lineY - 30}
          textAnchor="middle"
          fill={data.bias.favored === 'pin' ? '#D5302E' : '#2EA043'}
          fontSize="28"
          fontWeight="800"
        >
          {data.bias.favored === 'pin' ? 'PIN' : 'СУДЬЯ'} +
          {Math.round(Math.abs(data.bias.degrees))}°
        </text>
      )}
    </svg>
  );
}

type SchemaRung = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  center: boolean;
};

/**
 * Build the ladder of rungs in schema (SVG) coordinates. The ladder is
 * perpendicular to the wind, which in our schema is rotated by `tiltRad`
 * relative to "straight up". Returns segments clipped to the canvas height.
 */
function buildSchemaLadder(args: {
  anchorX: number;
  anchorY: number;
  tiltRad: number;
  step: number;
  rungs: number;
  halfWidth: number;
  clipMinY: number;
  clipMaxY: number;
}): SchemaRung[] {
  const half = Math.floor(args.rungs / 2);
  // "Up the ladder" direction in schema coords = rotated `up` (-Y) by tilt.
  const upX = Math.sin(args.tiltRad);
  const upY = -Math.cos(args.tiltRad);
  // Across-wind direction (perpendicular to wind, along the rung) = upDir
  // rotated by 90° clockwise.
  const acX = -upY;
  const acY = upX;
  const out: SchemaRung[] = [];
  for (let i = -half; i <= half; i++) {
    const cx = args.anchorX + upX * args.step * i;
    const cy = args.anchorY + upY * args.step * i;
    const x1 = cx - acX * args.halfWidth;
    const y1 = cy - acY * args.halfWidth;
    const x2 = cx + acX * args.halfWidth;
    const y2 = cy + acY * args.halfWidth;
    if (
      Math.min(y1, y2) > args.clipMaxY ||
      Math.max(y1, y2) < args.clipMinY
    ) {
      continue;
    }
    out.push({ x1, y1, x2, y2, center: i === 0 });
  }
  return out;
}

/** Project a point in SVG coordinates by a tilt angle (deg) and a length. */
function rotatedPoint(
  x: number,
  y: number,
  tiltDeg: number,
  length: number
): { x: number; y: number } {
  const r = (tiltDeg * Math.PI) / 180;
  return {
    x: x + Math.sin(r) * length,
    y: y - Math.cos(r) * length
  };
}
