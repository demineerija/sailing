import { useMemo } from 'react';
import {
  computeCourseSkew,
  computeLineBias,
  haversineDistance,
  initialBearing,
  midpoint
} from '../math/sailing';
import type { Course } from '../store/useSailingStore';

type Props = { course: Course };

/**
 * Abstract triangle visualization. Uses local-tangent x/y coordinates around
 * the course centroid; not a map projection — just enough to render layout.
 */
export function SchemaCanvas({ course }: Props) {
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
  const lineY = H * 0.78;
  const halfLine = W * 0.32;

  // Compute windward position based on courseAxis vs line normal.
  // Line is drawn horizontally with PIN on left, COMMITTEE on right.
  // Line bearing = +90° relative to "north" of schema. North in schema = up.
  // We render windward "up" with horizontal offset proportional to skew.
  const lineLength = data.lineLength;
  const skewDeg = data.skew?.degrees ?? 0;
  const distanceToWindward = course.windward
    ? haversineDistance(midpoint(course.pin, course.committee), course.windward)
    : lineLength * 3;
  const px = halfLine * 2;
  const yScale = (px / Math.max(lineLength, 1)) * 0.45; // tighten vertical
  const wWY = lineY - distanceToWindward * yScale;
  const wWX = cx + Math.tan((skewDeg * Math.PI) / 180) * (lineY - wWY);

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
