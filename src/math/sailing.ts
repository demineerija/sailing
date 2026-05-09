// Pure sailing math. Bearings are in degrees, true (from true north).
// Wind direction (TWD) is the direction the wind is coming FROM, in degrees true.

export type GeoCoord = { lat: number; lon: number };

export type FavoredEnd = 'pin' | 'committee' | 'neutral';
export type FavoredSide = 'port' | 'starboard' | 'neutral';

export type LineBias = {
  favored: FavoredEnd;
  /** Signed bias in degrees: >0 → PIN favored, <0 → COMMITTEE favored. */
  degrees: number;
  /** Positive metres advantage (always >= 0). */
  advantageMeters: number;
};

export type CourseSkew = {
  favored: FavoredSide;
  /** Signed skew in degrees: >0 → starboard side closer, <0 → port side closer. */
  degrees: number;
  /** Positive metres advantage (always >= 0). */
  advantageMeters: number;
};

export const NEUTRAL_THRESHOLD_DEG = 1.5;
const EARTH_RADIUS_M = 6_371_000;

export function deg2rad(d: number): number {
  return (d * Math.PI) / 180;
}

export function rad2deg(r: number): number {
  return (r * 180) / Math.PI;
}

/** Wrap a value into [0, 360). */
export function wrap360(d: number): number {
  const r = d % 360;
  return r < 0 ? r + 360 : r;
}

/** Wrap a value into (-180, 180]. */
export function wrap180(d: number): number {
  let r = ((d + 180) % 360) - 180;
  if (r <= -180) r += 360;
  return r;
}

/** Great-circle distance in metres. */
export function haversineDistance(a: GeoCoord, b: GeoCoord): number {
  const φ1 = deg2rad(a.lat);
  const φ2 = deg2rad(b.lat);
  const dφ = deg2rad(b.lat - a.lat);
  const dλ = deg2rad(b.lon - a.lon);
  const h =
    Math.sin(dφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial true bearing (forward azimuth) from→to in degrees [0, 360). */
export function initialBearing(from: GeoCoord, to: GeoCoord): number {
  const φ1 = deg2rad(from.lat);
  const φ2 = deg2rad(to.lat);
  const dλ = deg2rad(to.lon - from.lon);
  const y = Math.sin(dλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
  return wrap360(rad2deg(Math.atan2(y, x)));
}

/** Midpoint along a great-circle. Good enough for short start lines. */
export function midpoint(a: GeoCoord, b: GeoCoord): GeoCoord {
  const φ1 = deg2rad(a.lat);
  const λ1 = deg2rad(a.lon);
  const φ2 = deg2rad(b.lat);
  const dλ = deg2rad(b.lon - a.lon);
  const Bx = Math.cos(φ2) * Math.cos(dλ);
  const By = Math.cos(φ2) * Math.sin(dλ);
  const φm = Math.atan2(
    Math.sin(φ1) + Math.sin(φ2),
    Math.sqrt((Math.cos(φ1) + Bx) ** 2 + By ** 2)
  );
  const λm = λ1 + Math.atan2(By, Math.cos(φ1) + Bx);
  return { lat: rad2deg(φm), lon: ((rad2deg(λm) + 540) % 360) - 180 };
}

/**
 * Compute which end of the start line is favored.
 *
 * Convention: PIN is the port (left) end and COMMITTEE is the starboard (right)
 * end when looking from the line toward the windward mark.
 *
 * - lineBearing: bearing from PIN to COMMITTEE in degrees true.
 * - windDirection: TWD (where wind is from), degrees true.
 * - lineLength: line length in metres.
 *
 * Geometry: the upwind perpendicular to the line is `lineBearing - 90` (one
 * quarter-turn left from the PIN→COMMITTEE direction). When the wind shifts
 * clockwise relative to that perpendicular (TWD > perpendicular) the windward
 * mark moves to the right, so the starboard (COMMITTEE) end ends up closer to
 * the wind and is favored.
 *
 *   bias = wrap180(TWD - (lineBearing - 90))
 *     bias > 0 → COMMITTEE favored (wind shifted right of line normal)
 *     bias < 0 → PIN favored      (wind shifted left of line normal)
 *     |bias| < NEUTRAL_THRESHOLD_DEG → neutral
 *
 * advantageMeters = lineLength * sin(|bias|)
 */
export function computeLineBias(
  lineBearing: number,
  windDirection: number,
  lineLength: number
): LineBias {
  const normal = wrap360(lineBearing - 90);
  const bias = wrap180(windDirection - normal);
  const abs = Math.abs(bias);
  const favored: FavoredEnd =
    abs < NEUTRAL_THRESHOLD_DEG ? 'neutral' : bias > 0 ? 'committee' : 'pin';
  const advantageMeters =
    Math.max(0, lineLength) * Math.abs(Math.sin(deg2rad(abs)));
  return { favored, degrees: bias, advantageMeters };
}

/**
 * Compute course skew: which side of the course is closer to the windward mark.
 *
 * - courseAxis: bearing from the line midpoint to the windward mark, deg true.
 * - windDirection: TWD (where wind is from), deg true.
 * - lineLength: start line length in metres.
 *
 * skew = wrap180(courseAxis - TWD)
 *   skew > 0 → starboard side closer (right looking upwind)
 *   skew < 0 → port side closer (left looking upwind)
 *
 * advantageMeters = (lineLength / 2) * sin(|skew|)
 */
export function computeCourseSkew(
  courseAxis: number,
  windDirection: number,
  lineLength: number
): CourseSkew {
  const skew = wrap180(courseAxis - windDirection);
  const abs = Math.abs(skew);
  const favored: FavoredSide =
    abs < NEUTRAL_THRESHOLD_DEG ? 'neutral' : skew > 0 ? 'starboard' : 'port';
  const advantageMeters =
    (Math.max(0, lineLength) / 2) * Math.abs(Math.sin(deg2rad(abs)));
  return { favored, degrees: skew, advantageMeters };
}

/** Distance from a point to a line segment a–b, in metres. */
export function distanceToSegment(
  point: GeoCoord,
  a: GeoCoord,
  b: GeoCoord
): number {
  const ax = 0;
  const ay = 0;
  const meanLat = deg2rad((a.lat + b.lat) / 2);
  const mPerDegLat = 111_320;
  const mPerDegLon = 111_320 * Math.cos(meanLat);

  const bx = (b.lon - a.lon) * mPerDegLon;
  const by = (b.lat - a.lat) * mPerDegLat;
  const px = (point.lon - a.lon) * mPerDegLon;
  const py = (point.lat - a.lat) * mPerDegLat;

  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);

  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** Time to burn before crossing the line at given speed, or null when too slow. */
export function timeToBurnSeconds(
  distanceMeters: number,
  speedMps: number
): number | null {
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0) return null;
  if (!Number.isFinite(speedMps) || speedMps < 0.5) return null;
  return distanceMeters / speedMps;
}

/**
 * Project a point a given distance along a true bearing, assuming a flat
 * earth — accurate to <1 cm for the small distances ("ping at distance" is
 * normally 5–20 m) we care about.
 *
 * @param from  starting coordinate
 * @param bearingDeg true bearing in degrees (0=N, 90=E)
 * @param distanceMeters distance ahead in metres (negative = behind)
 */
export function projectCoord(
  from: GeoCoord,
  bearingDeg: number,
  distanceMeters: number
): GeoCoord {
  const meanLatRad = deg2rad(from.lat);
  const mPerDegLat = 111_320;
  const mPerDegLon = 111_320 * Math.cos(meanLatRad);
  const east = distanceMeters * Math.sin(deg2rad(bearingDeg));
  const north = distanceMeters * Math.cos(deg2rad(bearingDeg));
  return {
    lat: from.lat + north / mPerDegLat,
    lon: from.lon + east / mPerDegLon
  };
}

export type LadderLine = {
  /** Stack index — 0 = the rung passing through the anchor (windward). */
  index: number;
  /** True distance along the upwind axis from the anchor (positive = above
   *  windward, negative = below toward the start line). */
  offsetMeters: number;
  /** Two endpoints to draw on the map. */
  a: GeoCoord;
  b: GeoCoord;
};

/**
 * Build a ladder of equal-step rungs perpendicular to the wind. Each rung is
 * a fair-line: every boat sitting on the same rung is the same distance from
 * the windward mark, regardless of which side of the course they are on. The
 * rung with `index === 0` passes through the anchor (typically the windward
 * mark), positive indices climb closer to the wind, negative ones drop back
 * toward the line.
 *
 * @param anchor  the point the central rung passes through
 * @param windDirection TWD (where wind is FROM), degrees true
 * @param rungSpacingMeters distance between rungs (suggest 30–60 m)
 * @param rungs   total rungs to emit (centred on the anchor; default 11)
 * @param halfWidthMeters how far each rung extends to either side
 */
export function ladderLines(
  anchor: GeoCoord,
  windDirection: number,
  rungSpacingMeters: number,
  rungs = 11,
  halfWidthMeters?: number
): LadderLine[] {
  const half = Math.floor(rungs / 2);
  // The "upwind" direction (where you sail toward) is TWD itself, since the
  // wind is coming FROM there.
  const upwind = wrap360(windDirection);
  const acrossWind = wrap360(windDirection + 90);
  const width = halfWidthMeters ?? rungSpacingMeters * (rungs - 1);
  const out: LadderLine[] = [];
  for (let i = -half; i <= half; i++) {
    const offset = i * rungSpacingMeters;
    const centre = projectCoord(anchor, upwind, offset);
    out.push({
      index: i,
      offsetMeters: offset,
      a: projectCoord(centre, acrossWind, -width),
      b: projectCoord(centre, acrossWind, width)
    });
  }
  return out;
}

export type LayLines = {
  /** Layline that approaches the windward mark on starboard tack — the
   *  preferred final approach (right-of-way under rule 10). */
  starboard: { from: GeoCoord; to: GeoCoord };
  /** Layline that approaches the windward mark on port tack. */
  port: { from: GeoCoord; to: GeoCoord };
};

/**
 * Build the two laylines emanating downwind from the windward mark.
 *
 * - Boats inside the cone formed by the two laylines can fetch the windward
 *   mark with one tack.
 * - Boats outside need at least one extra tack.
 *
 * @param windward  the windward mark
 * @param windDirection TWD (where wind is FROM), degrees true
 * @param laylineDeg upwind angle off the wind, typically 40–50° (45° default)
 * @param lengthMeters how far down to draw each layline
 */
export function laylines(
  windward: GeoCoord,
  windDirection: number,
  laylineDeg: number,
  lengthMeters: number
): LayLines {
  // Looking from the windward mark down toward the start, we walk along a
  // bearing that is `(TWD + 180) ± laylineDeg`. The starboard-tack layline
  // sits to the LEFT (port side) of the upwind axis (TWD); a boat on it is
  // sailing away from the mark on starboard tack toward the bottom-left.
  const downwind = wrap360(windDirection + 180);
  const stbBearing = wrap360(downwind - laylineDeg);
  const portBearing = wrap360(downwind + laylineDeg);
  return {
    starboard: {
      from: windward,
      to: projectCoord(windward, stbBearing, lengthMeters)
    },
    port: {
      from: windward,
      to: projectCoord(windward, portBearing, lengthMeters)
    }
  };
}

export type SanityWarning =
  | { type: 'lineTooShort'; meters: number }
  | { type: 'biasNearlyAlongLine'; degrees: number }
  | { type: 'windwardNotUpwind' };

/**
 * Build a list of soft warnings.
 *
 * - lineTooShort: line < 20m, GPS noise dominates.
 * - biasNearlyAlongLine: |bias| > 80°, formula is unstable.
 * - windwardNotUpwind: angle between (midpoint→windward) and (-TWD) > 90°.
 */
export function sanityWarnings(
  pin: GeoCoord,
  committee: GeoCoord,
  windward: GeoCoord | null,
  windDirection: number,
  bias: LineBias
): SanityWarning[] {
  const warnings: SanityWarning[] = [];
  const lineLength = haversineDistance(pin, committee);
  if (lineLength < 20) {
    warnings.push({ type: 'lineTooShort', meters: lineLength });
  }
  if (Math.abs(bias.degrees) > 80) {
    warnings.push({ type: 'biasNearlyAlongLine', degrees: bias.degrees });
  }
  if (windward) {
    const courseAxis = initialBearing(midpoint(pin, committee), windward);
    // "Upwind" direction from the line midpoint toward the wind source is TWD
    // itself (TWD = where wind is coming FROM). If the windward mark sits more
    // than 90° away from upwind, it's effectively in the lee.
    if (Math.abs(wrap180(courseAxis - windDirection)) > 90) {
      warnings.push({ type: 'windwardNotUpwind' });
    }
  }
  return warnings;
}
