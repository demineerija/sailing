// Free wind forecast from Open-Meteo. No API key required.
// Docs: https://open-meteo.com/en/docs

export type ExternalWind = {
  /** Direction the wind is coming FROM, in degrees true (0..360). */
  direction: number;
  /** Wind speed in metres per second. */
  speedMps: number;
  /** Gust speed in metres per second, if reported. */
  gustMps?: number;
  /** Forecast model time the value applies to (ms epoch). */
  forecastTime: number;
  source: 'open-meteo';
};

export class WindApiError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'WindApiError';
  }
}

/**
 * Fetch the current wind reading at a coordinate. Uses Open-Meteo's
 * `current` parameter which returns the most recent forecast model time
 * (typically updated hourly). Speed is requested in m/s.
 */
export async function fetchCurrentWind(
  lat: number,
  lon: number,
  signal?: AbortSignal
): Promise<ExternalWind> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', lat.toFixed(4));
  url.searchParams.set('longitude', lon.toFixed(4));
  url.searchParams.set(
    'current',
    'wind_direction_10m,wind_speed_10m,wind_gusts_10m'
  );
  url.searchParams.set('wind_speed_unit', 'ms');
  url.searchParams.set('timeformat', 'unixtime');

  let res: Response;
  try {
    res = await fetch(url.toString(), { signal });
  } catch (err) {
    throw new WindApiError('Нет интернета или сервер недоступен', err);
  }

  if (!res.ok) {
    throw new WindApiError(
      `Сервер ответил ${res.status} ${res.statusText}`
    );
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch (err) {
    throw new WindApiError('Не удалось разобрать ответ сервера', err);
  }

  const current = (data as { current?: Record<string, unknown> }).current;
  if (!current) {
    throw new WindApiError('Сервер не вернул данные о ветре');
  }

  const direction = Number(current.wind_direction_10m);
  const speedMps = Number(current.wind_speed_10m);
  const gustMps = Number(current.wind_gusts_10m);
  const time = Number(current.time);

  if (!Number.isFinite(direction) || !Number.isFinite(speedMps)) {
    throw new WindApiError('Некорректные данные от сервера');
  }

  return {
    direction: ((direction % 360) + 360) % 360,
    speedMps,
    gustMps: Number.isFinite(gustMps) ? gustMps : undefined,
    forecastTime: Number.isFinite(time) ? time * 1000 : Date.now(),
    source: 'open-meteo'
  };
}
