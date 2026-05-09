import * as orientation from './orientation';
import { pingWithAveraging, type PingResult } from './geolocation';
import { projectCoord } from '../math/sailing';

export type ProjectedPing = PingResult & {
  /** True compass heading at the moment of the ping, if available. */
  headingTrue: number | null;
  /** Offset that was actually applied to the GPS fix (m, signed). */
  offsetApplied: number;
};

/**
 * Mean of an array of angles in degrees, robust to wrap at 0/360. Returns
 * null for empty input so callers can decide what to do.
 */
function circularMean(values: number[]): number | null {
  if (values.length === 0) return null;
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

/**
 * Wraps `pingWithAveraging` and, if `offsetMeters !== 0`, projects the
 * resulting GPS coord forward by that distance in the direction the boat is
 * pointing (averaged compass during the hold). Falls back gracefully:
 *
 *  - If we don't have compass permission yet, requests it (this triggers the
 *    iOS permission prompt the first time the user pings).
 *  - If permission is denied or no compass samples arrive during the hold,
 *    returns the raw GPS coord with `headingTrue: null` and
 *    `offsetApplied: 0`. The caller can detect this and warn the user.
 */
export async function pingProjected(
  holdMs: number,
  offsetMeters: number
): Promise<ProjectedPing> {
  // No offset → just delegate (no compass needed, no permission prompt).
  if (!Number.isFinite(offsetMeters) || offsetMeters === 0) {
    const r = await pingWithAveraging(holdMs);
    return { ...r, headingTrue: null, offsetApplied: 0 };
  }

  // Make sure we'll receive compass events. On iOS, this also triggers the
  // permission prompt the first time. The prompt requires a user gesture,
  // and PingButton calls us inside one (pointer-down handler).
  if (!orientation.isPermissionGranted()) {
    try {
      await orientation.requestPermission();
    } catch {
      // ignore – we'll just fall through with no heading
    }
  }

  const headings: number[] = [];
  const off = orientation.subscribe((h) => headings.push(h));
  let result: PingResult;
  try {
    result = await pingWithAveraging(holdMs);
  } finally {
    off();
  }

  const heading = circularMean(headings);
  if (heading === null) {
    // Compass silent — return the raw fix; caller may want to warn the user
    // that the offset was not applied.
    return { ...result, headingTrue: null, offsetApplied: 0 };
  }

  const projected = projectCoord(result.coord, heading, offsetMeters);
  return {
    coord: projected,
    accuracy: result.accuracy,
    samples: result.samples,
    headingTrue: heading,
    offsetApplied: offsetMeters
  };
}
