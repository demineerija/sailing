import { wrap360 } from '../math/sailing';

/**
 * Convert device compass reading into TWD (true wind direction — where the
 * wind comes *from*).
 *
 * iOS `webkitCompassHeading` is the **true bearing of the top edge of the
 * phone** (clockwise from north). If you aim that edge **into** the wind
 * (nose of wind toward you along that axis), that bearing *is* the direction
 * wind comes from → TWD.
 *
 * If you habitually hold the phone the other way (top edge pointing **down**-
 * wind), enable `flip180` in settings or add 180° here so TWD still matches
 * reality.
 */
export function compassHeadingToTwd(
  headingDeg: number,
  flip180: boolean
): number {
  const h = wrap360(headingDeg);
  return flip180 ? wrap360(h + 180) : h;
}
