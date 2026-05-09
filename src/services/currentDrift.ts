// Current-drift measurement: kill the engine, let the boat drift, sample
// GPS for the configured window and report the average set + drift.
//
// "Set" = direction the current is flowing TOWARD (degrees true, 0=N).
// "Drift" = speed of the current (m/s, also reported in knots in the UI).

import {
  haversineDistance,
  initialBearing,
  type GeoCoord
} from '../math/sailing';
import type { CurrentVector } from '../store/useSailingStore';

const ACCURACY_THRESHOLD_M = 20;
const MIN_SAMPLES = 4;
/** Drop samples this much below the start (a stray fix from before the boat
 *  actually stopped). */
const HEAD_TRIM_FRACTION = 0.15;

export class DriftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DriftError';
  }
}

export type DriftHandle = {
  stop: () => Promise<CurrentVector>;
  cancel: () => void;
  elapsedMs: () => number;
  sampleCount: () => number;
};

type Sample = {
  coord: GeoCoord;
  ts: number;
  accuracy: number;
};

/**
 * Begin a drift measurement. The returned handle can be stopped at any time;
 * the result is computed from the collected samples.
 *
 * The default minimum window is 30 seconds — anything shorter is dominated
 * by GPS noise. The UI should encourage the coach to wait 60–120s.
 */
export function startDrift(opts?: {
  minDurationMs?: number;
}): DriftHandle {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    throw new DriftError('Геолокация недоступна.');
  }
  const minDurationMs = opts?.minDurationMs ?? 30_000;
  const samples: Sample[] = [];
  const startedAt = performance.now();

  const watchId = navigator.geolocation.watchPosition(
    (p) => {
      if (p.coords.accuracy <= ACCURACY_THRESHOLD_M) {
        samples.push({
          coord: { lat: p.coords.latitude, lon: p.coords.longitude },
          ts: p.timestamp,
          accuracy: p.coords.accuracy
        });
      }
    },
    () => {
      /* swallow — we'll surface failures only on stop */
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 60_000 }
  );

  let stopped = false;

  const cleanup = () => {
    stopped = true;
    navigator.geolocation.clearWatch(watchId);
  };

  return {
    stop: async () => {
      if (stopped) {
        throw new DriftError('Замер уже остановлен.');
      }
      cleanup();
      const elapsed = performance.now() - startedAt;
      if (elapsed < minDurationMs) {
        throw new DriftError(
          `Слишком короткий замер (${Math.round(elapsed / 1000)}с). Нужен хотя бы ${Math.round(
            minDurationMs / 1000
          )}с.`
        );
      }
      if (samples.length < MIN_SAMPLES) {
        throw new DriftError(
          `Мало валидных GPS-точек (${samples.length}). Подожди ещё или зайди ближе к открытой воде.`
        );
      }
      return computeDriftVector(samples);
    },
    cancel: cleanup,
    elapsedMs: () => performance.now() - startedAt,
    sampleCount: () => samples.length
  };
}

export function computeDriftVector(samples: Sample[]): CurrentVector {
  // Trim the very first samples — the boat may still be coasting from the
  // last engine push. Use a robust fit: regress lat/lon vs time to get a
  // least-squares velocity, then derive direction + speed from that.
  const headDrop = Math.floor(samples.length * HEAD_TRIM_FRACTION);
  const fit = samples.slice(headDrop);
  if (fit.length < 2) {
    throw new DriftError('Недостаточно данных для расчёта.');
  }
  const t0 = fit[0].ts;
  const meanLat = fit.reduce((s, x) => s + x.coord.lat, 0) / fit.length;
  const mPerDegLat = 111_320;
  const mPerDegLon = 111_320 * Math.cos((meanLat * Math.PI) / 180);

  const ts: number[] = [];
  const xs: number[] = []; // east metres
  const ys: number[] = []; // north metres
  for (const s of fit) {
    ts.push((s.ts - t0) / 1000);
    xs.push((s.coord.lon - fit[0].coord.lon) * mPerDegLon);
    ys.push((s.coord.lat - fit[0].coord.lat) * mPerDegLat);
  }
  const slopeX = leastSquaresSlope(ts, xs);
  const slopeY = leastSquaresSlope(ts, ys);
  const speedMps = Math.hypot(slopeX, slopeY);
  // direction the boat moves toward, in degrees true (0=N, 90=E).
  const setDirection =
    (((Math.atan2(slopeX, slopeY) * 180) / Math.PI) + 360) % 360;

  const startCoord = fit[0].coord;
  const endCoord = fit[fit.length - 1].coord;
  return {
    setDirection,
    speedMps,
    distanceMeters: haversineDistance(startCoord, endCoord),
    durationMs: fit[fit.length - 1].ts - fit[0].ts,
    samples: fit.length,
    startCoord,
    endCoord,
    measuredAt: Date.now()
  };
}

function leastSquaresSlope(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i];
    sumY += ys[i];
    sumXY += xs[i] * ys[i];
    sumXX += xs[i] * xs[i];
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

/** Convenience: convert m/s → knots. */
export function mpsToKnots(mps: number): number {
  return mps * 1.94384;
}

/** Format the bearing of a vector in compass terms (just for the UI). */
export function bearingLabel(deg: number): string {
  const r = ((deg % 360) + 360) % 360;
  if (r < 22.5 || r >= 337.5) return 'на N';
  if (r < 67.5) return 'на NE';
  if (r < 112.5) return 'на E';
  if (r < 157.5) return 'на SE';
  if (r < 202.5) return 'на S';
  if (r < 247.5) return 'на SW';
  if (r < 292.5) return 'на W';
  return 'на NW';
}

// Re-export so consumers can import from one module if they wish.
export { initialBearing };
