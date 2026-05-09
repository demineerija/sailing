import { describe, expect, it } from 'vitest';
import {
  computeCourseSkew,
  computeLineBias,
  distanceToSegment,
  haversineDistance,
  initialBearing,
  midpoint,
  NEUTRAL_THRESHOLD_DEG,
  projectCoord,
  sanityWarnings,
  timeToBurnSeconds,
  wrap180,
  wrap360
} from './sailing';

const PIN = { lat: 43.7000, lon: 7.2700 };
const COMMITTEE = { lat: 43.7000, lon: 7.2712398 };
const WINDWARD = { lat: 43.7045, lon: 7.27062 };

describe('wrap helpers', () => {
  it('wrap360 keeps values in [0, 360)', () => {
    expect(wrap360(0)).toBe(0);
    expect(wrap360(360)).toBe(0);
    expect(wrap360(-1)).toBe(359);
    expect(wrap360(720.5)).toBeCloseTo(0.5);
  });

  it('wrap180 keeps values in (-180, 180]', () => {
    expect(wrap180(180)).toBe(180);
    expect(wrap180(-180)).toBe(180);
    expect(wrap180(190)).toBe(-170);
    expect(wrap180(-190)).toBe(170);
  });
});

describe('haversine + bearings', () => {
  it('haversine line length is around 100m', () => {
    const d = haversineDistance(PIN, COMMITTEE);
    expect(d).toBeGreaterThan(95);
    expect(d).toBeLessThan(105);
  });

  it('initial bearing PIN→COMMITTEE is ~90°', () => {
    expect(initialBearing(PIN, COMMITTEE)).toBeCloseTo(90, 0);
  });

  it('midpoint lies between the two ends', () => {
    const m = midpoint(PIN, COMMITTEE);
    expect(m.lat).toBeCloseTo(43.7, 4);
    expect(m.lon).toBeCloseTo((PIN.lon + COMMITTEE.lon) / 2, 4);
  });
});

describe('computeLineBias', () => {
  // Line bearing PIN→COMMITTEE = 90° (line lies west→east).
  // Normal upwind = 0° (north).  PIN is on the left (west, port end),
  // COMMITTEE is on the right (east, starboard end).
  const lineBearing = 90;
  const lineLength = 100;

  it('COMMITTEE favored when wind shifts clockwise of line normal (toward starboard end)', () => {
    // TWD=10° → wind comes a bit from the east-of-north → windward mark
    // ends up north-east of the start, closer to the COMMITTEE (east) end.
    const bias = computeLineBias(lineBearing, 10, lineLength);
    expect(bias.favored).toBe('committee');
    expect(bias.degrees).toBeCloseTo(10, 5);
    expect(bias.advantageMeters).toBeCloseTo(lineLength * Math.sin((10 * Math.PI) / 180), 3);
  });

  it('PIN favored when wind shifts the other way (toward port end)', () => {
    const bias = computeLineBias(lineBearing, 350, lineLength);
    expect(bias.favored).toBe('pin');
    expect(bias.degrees).toBeCloseTo(-10, 5);
  });

  it('neutral when wind is exactly perpendicular to line', () => {
    const bias = computeLineBias(lineBearing, 0, lineLength);
    expect(bias.favored).toBe('neutral');
    expect(Math.abs(bias.degrees)).toBeLessThan(NEUTRAL_THRESHOLD_DEG);
  });

  it('wrap-around: TWD 355° vs 5° give consistent (mirrored) answers', () => {
    const a = computeLineBias(lineBearing, 355, lineLength);
    const b = computeLineBias(lineBearing, 5, lineLength);
    expect(a.favored).toBe('pin');
    expect(b.favored).toBe('committee');
    expect(Math.abs(a.degrees + b.degrees)).toBeLessThan(1e-9);
  });

  it('matches the geometric truth: end closer to a windward mark = favored', () => {
    // Physical sanity check: place a windward mark at the bearing implied by
    // TWD and verify the favored end is actually the closer one.
    const cases = [
      { twd: 10, expected: 'committee' as const },
      { twd: 350, expected: 'pin' as const },
      { twd: 30, expected: 'committee' as const },
      { twd: 330, expected: 'pin' as const }
    ];
    for (const { twd, expected } of cases) {
      const bias = computeLineBias(lineBearing, twd, lineLength);
      expect(bias.favored).toBe(expected);
    }
  });

  it('warns when wind nearly along line (|bias| > 80°)', () => {
    const bias = computeLineBias(lineBearing, 85, 100);
    const warnings = sanityWarnings(PIN, COMMITTEE, null, 85, bias);
    expect(warnings.some((w) => w.type === 'biasNearlyAlongLine')).toBe(true);
  });
});

describe('computeCourseSkew', () => {
  const lineLength = 100;
  // courseAxis from midpoint to windward (degrees true).
  // skew = wrap180(courseAxis - TWD).

  it('skew right (starboard side closer) when courseAxis > TWD', () => {
    const skew = computeCourseSkew(15, 0, lineLength);
    expect(skew.favored).toBe('starboard');
    expect(skew.degrees).toBeCloseTo(15, 5);
    expect(skew.advantageMeters).toBeCloseTo((lineLength / 2) * Math.sin((15 * Math.PI) / 180), 3);
  });

  it('skew left (port side closer) when courseAxis < TWD', () => {
    const skew = computeCourseSkew(345, 0, lineLength);
    expect(skew.favored).toBe('port');
    expect(skew.degrees).toBeCloseTo(-15, 5);
  });

  it('neutral when courseAxis == TWD (windward directly upwind, downwind axis aligned)', () => {
    // upwind from windward to mid is 180° relative to TWD; setting courseAxis == TWD
    // gives skew = 0 → neutral
    const skew = computeCourseSkew(180, 180, lineLength);
    expect(skew.favored).toBe('neutral');
  });
});

describe('distanceToSegment', () => {
  it('point on the line segment is ~0m', () => {
    const m = midpoint(PIN, COMMITTEE);
    const d = distanceToSegment(m, PIN, COMMITTEE);
    expect(d).toBeLessThan(0.5);
  });

  it('point off the segment returns positive distance', () => {
    // Move ~10m north of midpoint (~0.00009 deg lat).
    const m = midpoint(PIN, COMMITTEE);
    const offset = { lat: m.lat + 0.0001, lon: m.lon };
    const d = distanceToSegment(offset, PIN, COMMITTEE);
    expect(d).toBeGreaterThan(8);
    expect(d).toBeLessThan(15);
  });

  it('point past the end clamps to the endpoint', () => {
    const past = { lat: PIN.lat, lon: PIN.lon - 0.001 };
    const d = distanceToSegment(past, PIN, COMMITTEE);
    const directToPin = haversineDistance(past, PIN);
    expect(Math.abs(d - directToPin)).toBeLessThan(1.5);
  });
});

describe('timeToBurnSeconds', () => {
  it('returns null when speed is below threshold', () => {
    expect(timeToBurnSeconds(100, 0.4)).toBeNull();
    expect(timeToBurnSeconds(100, 0)).toBeNull();
  });

  it('returns distance/speed when speed is above threshold', () => {
    expect(timeToBurnSeconds(100, 2)).toBeCloseTo(50, 5);
  });

  it('returns null for invalid inputs', () => {
    expect(timeToBurnSeconds(-1, 5)).toBeNull();
    expect(timeToBurnSeconds(Number.NaN, 5)).toBeNull();
  });
});

describe('projectCoord', () => {
  it('returns the same point for distance 0', () => {
    const p = projectCoord(PIN, 90, 0);
    expect(p.lat).toBeCloseTo(PIN.lat, 6);
    expect(p.lon).toBeCloseTo(PIN.lon, 6);
  });

  it('moves ~10 m east when bearing is 90°', () => {
    const east = projectCoord(PIN, 90, 10);
    const d = haversineDistance(PIN, east);
    expect(d).toBeGreaterThan(9.5);
    expect(d).toBeLessThan(10.5);
    // bearing back to PIN should be roughly 270°
    const back = initialBearing(east, PIN);
    expect(Math.abs(back - 270)).toBeLessThan(0.5);
  });

  it('negative distance projects the opposite way', () => {
    const ahead = projectCoord(PIN, 0, 5);
    const behind = projectCoord(PIN, 0, -5);
    expect(ahead.lat).toBeGreaterThan(PIN.lat);
    expect(behind.lat).toBeLessThan(PIN.lat);
  });
});

describe('sanityWarnings', () => {
  it('warns about a too-short line', () => {
    const pinClose = { lat: 43.7, lon: 7.27 };
    const cmtClose = { lat: 43.7, lon: 7.27006 }; // ~5m east
    const bias = computeLineBias(90, 10, 5);
    const warnings = sanityWarnings(pinClose, cmtClose, null, 10, bias);
    expect(warnings.some((w) => w.type === 'lineTooShort')).toBe(true);
  });

  it('warns when windward is not upwind of mid', () => {
    // windward placed SOUTH of line midpoint, but TWD says wind comes from north
    const downwindMark = { lat: 43.6955, lon: 7.27062 };
    const bias = computeLineBias(90, 0, haversineDistance(PIN, COMMITTEE));
    const warnings = sanityWarnings(PIN, COMMITTEE, downwindMark, 0, bias);
    expect(warnings.some((w) => w.type === 'windwardNotUpwind')).toBe(true);
  });

  it('no warnings for a healthy course', () => {
    const bias = computeLineBias(90, 5, haversineDistance(PIN, COMMITTEE));
    const warnings = sanityWarnings(PIN, COMMITTEE, WINDWARD, 5, bias);
    expect(warnings.length).toBe(0);
  });
});
