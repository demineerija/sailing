import type { GeoCoord } from '../math/sailing';

export type LiveGps = {
  coord: GeoCoord;
  accuracy: number;
  speedMps: number | null;
  headingTrue: number | null;
  ts: number;
};

export type PingResult = {
  coord: GeoCoord;
  accuracy: number;
  samples: number;
};

const ACCURACY_THRESHOLD_M = 15;
const MIN_ACCEPTABLE_SAMPLES = 3;

let watchId: number | null = null;
const subscribers = new Set<(g: LiveGps) => void>();
let lastError: GeolocationPositionError | null = null;

function emit(g: LiveGps) {
  subscribers.forEach((cb) => cb(g));
}

function toLiveGps(p: GeolocationPosition): LiveGps {
  return {
    coord: { lat: p.coords.latitude, lon: p.coords.longitude },
    accuracy: p.coords.accuracy,
    speedMps: p.coords.speed ?? null,
    headingTrue: p.coords.heading ?? null,
    ts: p.timestamp
  };
}

export function isAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

export function start(): void {
  if (!isAvailable() || watchId !== null) return;
  watchId = navigator.geolocation.watchPosition(
    (p) => {
      lastError = null;
      emit(toLiveGps(p));
    },
    (err) => {
      lastError = err;
    },
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 30000 }
  );
}

export function stop(): void {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}

export function subscribe(cb: (g: LiveGps) => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

export function lastErrorMessage(): string | null {
  return lastError?.message ?? null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Collect GPS fixes during the hold window, filter by accuracy < 15 m, and
 * return median lat/lon. Rejects if fewer than MIN_ACCEPTABLE_SAMPLES samples.
 */
export function pingWithAveraging(holdMs: number): Promise<PingResult> {
  return new Promise((resolve, reject) => {
    if (!isAvailable()) {
      reject(new Error('Геолокация недоступна'));
      return;
    }
    const samples: { lat: number; lon: number; acc: number }[] = [];
    const id = navigator.geolocation.watchPosition(
      (p) => {
        if (p.coords.accuracy <= ACCURACY_THRESHOLD_M) {
          samples.push({
            lat: p.coords.latitude,
            lon: p.coords.longitude,
            acc: p.coords.accuracy
          });
        }
      },
      (err) => {
        navigator.geolocation.clearWatch(id);
        reject(new Error(err.message || 'GPS ошибка'));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: holdMs + 5000 }
    );

    setTimeout(() => {
      navigator.geolocation.clearWatch(id);
      if (samples.length < MIN_ACCEPTABLE_SAMPLES) {
        reject(
          new Error(
            `GPS плохой (${samples.length} приемлемых отсчётов из ≥${MIN_ACCEPTABLE_SAMPLES})`
          )
        );
        return;
      }
      const lat = median(samples.map((s) => s.lat));
      const lon = median(samples.map((s) => s.lon));
      const acc = median(samples.map((s) => s.acc));
      resolve({ coord: { lat, lon }, accuracy: acc, samples: samples.length });
    }, holdMs);
  });
}

export async function requestPermission(): Promise<'granted' | 'denied' | 'prompt' | 'unknown'> {
  if (!isAvailable()) return 'denied';
  // Trigger permission prompt via a one-shot getCurrentPosition.
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => resolve('granted'),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) resolve('denied');
        else resolve('unknown');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}
