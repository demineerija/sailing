import { describe, expect, it } from 'vitest';
import { compassHeadingToTwd } from '../services/windFromCompass';

describe('compassHeadingToTwd', () => {
  it('passes through when flip is off', () => {
    expect(compassHeadingToTwd(270, false)).toBe(270);
    expect(compassHeadingToTwd(0, false)).toBe(0);
  });

  it('adds 180° when flip is on', () => {
    expect(compassHeadingToTwd(270, true)).toBe(90);
    expect(compassHeadingToTwd(90, true)).toBe(270);
  });
});
