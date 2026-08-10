import type { Position } from '../types/navigation';
import { parseNoaaGmt, type Utc } from '../utils/time';

/**
 * Wind forecast from Open-Meteo.
 *
 * Chosen as the default provider because it needs no key, which matters for a PWA that
 * has to work for anyone who installs it. Kept behind the same narrow interface as the
 * NOAA client: Open-Meteo's parameter names and response shape stop here.
 *
 * PredictWind is left as a future alternate provider — the app already produces a
 * PredictWind-formatted route summary — but nothing in the interface below assumes a
 * particular source.
 */

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';

export interface WindPoint {
  at: Utc;
  speedKn: number;
  gustKn: number;
  /** Direction the wind is coming FROM, degrees true. */
  directionDeg: number;
}

export interface WindForecast {
  position: Position;
  fetchedAt: Utc;
  /** When the model run was issued, for lead-time confidence. */
  issuedAt: Utc;
  points: WindPoint[];
}

interface OpenMeteoResponse {
  hourly?: {
    time?: string[];
    wind_speed_10m?: number[];
    wind_direction_10m?: number[];
    wind_gusts_10m?: number[];
  };
  error?: boolean;
  reason?: string;
}

export class WindForecastError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = 'WindForecastError';
    this.retryable = retryable;
  }
}

/** Converts Open-Meteo's response into the app's shape. Exported so tests can drive it. */
export function parseWindResponse(
  body: OpenMeteoResponse,
  position: Position,
  fetchedAt: Utc
): WindForecast {
  if (body.error) {
    throw new WindForecastError(`Open-Meteo: ${body.reason ?? 'request rejected'}`, false);
  }

  const hourly = body.hourly;
  const times = hourly?.time ?? [];
  const speeds = hourly?.wind_speed_10m ?? [];
  const directions = hourly?.wind_direction_10m ?? [];
  const gusts = hourly?.wind_gusts_10m ?? [];

  const points: WindPoint[] = [];
  for (let i = 0; i < times.length; i++) {
    const speed = speeds[i];
    const direction = directions[i];
    if (!Number.isFinite(speed) || !Number.isFinite(direction)) continue;
    points.push({
      // Requested in UTC, so the same unambiguous parsing as NOAA applies.
      at: parseNoaaGmt(times[i].replace('T', ' ').slice(0, 16)),
      speedKn: speed,
      gustKn: Number.isFinite(gusts[i]) ? gusts[i] : speed,
      directionDeg: direction,
    });
  }

  return {
    position,
    fetchedAt,
    issuedAt: points[0]?.at ?? fetchedAt,
    points: points.sort((a, b) => a.at - b.at),
  };
}

export async function fetchWindForecast(
  position: Position,
  days = 7
): Promise<WindForecast> {
  const params = new URLSearchParams({
    latitude: position.lat.toFixed(4),
    longitude: position.lng.toFixed(4),
    hourly: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    wind_speed_unit: 'kn',
    timezone: 'UTC',
    forecast_days: String(Math.min(16, Math.max(1, days))),
  });

  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}?${params.toString()}`);
  } catch (err) {
    throw new WindForecastError(`Could not reach Open-Meteo: ${(err as Error).message}`, true);
  }

  if (response.status >= 400 && response.status < 500) {
    throw new WindForecastError(`Open-Meteo rejected the request (${response.status})`, false);
  }
  if (!response.ok) {
    throw new WindForecastError(`Open-Meteo returned ${response.status}`, true);
  }

  return parseWindResponse((await response.json()) as OpenMeteoResponse, position, Date.now());
}

/** Nearest hourly point to an instant, or null when the forecast does not reach it. */
export function windAt(forecast: WindForecast, at: Utc): WindPoint | null {
  if (forecast.points.length === 0) return null;

  const first = forecast.points[0].at;
  const last = forecast.points[forecast.points.length - 1].at;
  // Beyond the forecast horizon there is no wind data, and saying so beats extrapolating.
  if (at < first - 3_600_000 || at > last + 3_600_000) return null;

  let best = forecast.points[0];
  for (const point of forecast.points) {
    if (Math.abs(point.at - at) < Math.abs(best.at - at)) best = point;
  }
  return best;
}

/** Whole days between the forecast being issued and an instant, for confidence grading. */
export function leadDays(forecast: WindForecast, at: Utc): number {
  return Math.max(0, (at - forecast.issuedAt) / 86_400_000);
}
