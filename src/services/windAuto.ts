// Background wind refresher. When `intervalMinutes > 0` and we have a
// usable coordinate, we periodically fetch the current wind from
// Open-Meteo and feed it back into the store. Only the first response
// after a manual setting wins for the same minute (we use the fetched
// timestamp to avoid spamming the wind history with duplicates).

import { fetchCurrentWind } from './windApi';

export type AutoWindParams = {
  getCoord: () => { lat: number; lon: number } | null;
  getIntervalMinutes: () => number;
  setWind: (direction: number, source: 'auto', speedMps: number) => void;
  onError?: (msg: string) => void;
};

export type AutoWindHandle = {
  stop: () => void;
  refreshNow: () => Promise<void>;
};

export function startAutoWind(params: AutoWindParams): AutoWindHandle {
  let timer: number | null = null;
  let lastFetchTs = 0;
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    const min = params.getIntervalMinutes();
    if (min <= 0) return;
    const coord = params.getCoord();
    if (!coord) return;
    try {
      const w = await fetchCurrentWind(coord.lat, coord.lon);
      if (stopped) return;
      // Open-Meteo updates hourly; skip when the timestamp didn't change.
      if (w.forecastTime === lastFetchTs) return;
      lastFetchTs = w.forecastTime;
      params.setWind(w.direction, 'auto', w.speedMps);
    } catch (err) {
      params.onError?.(err instanceof Error ? err.message : String(err));
    }
  };

  const schedule = () => {
    if (timer !== null) clearTimeout(timer);
    const min = params.getIntervalMinutes();
    if (min <= 0) {
      timer = null;
      return;
    }
    timer = window.setTimeout(async () => {
      await tick();
      schedule();
    }, min * 60_000);
  };

  // initial fetch shortly after start so the user sees something quickly
  timer = window.setTimeout(async () => {
    await tick();
    schedule();
  }, 4_000);

  return {
    stop: () => {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
    refreshNow: tick
  };
}
