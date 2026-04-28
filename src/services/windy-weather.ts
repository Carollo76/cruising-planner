import type { Position } from '../types/navigation';
import { db } from '../db/database';

/** Windy Point Forecast API client.
 *  Docs: https://api.windy.com/point-forecast/docs
 *
 *  CRITICAL: All API responses are cached for 2 hours. This prevents:
 *  - Inconsistent results when the user presses "Assess" or "Find windows" multiple times
 *  - Wasted API calls (1,000/day limit)
 *  - Data changing between the wind fetch and wave fetch within the same assessment
 *
 *  Two-tier cache: in-memory Map (L1, fast) backed by Dexie windyCache table (L2, persistent).
 *  L2 means refreshing the page does NOT trigger fresh API calls — same forecast persists across
 *  sessions until expiry. The cache is keyed by rounded lat/lng + model. */

const WINDY_ENDPOINT = 'https://api.windy.com/api/point-forecast/v2';
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours — GFS model updates every 6h, no point re-fetching sooner

export type WindyModel = 'gfs' | 'ecmwf' | 'iconEu' | 'nam' | 'namConus' | 'gfsWave' | 'ecmwfWaves';

interface WindyRequest {
  lat: number;
  lon: number;
  model: WindyModel;
  parameters: string[];
  levels?: string[];
  key: string;
}

interface WindyRawResponse {
  ts: number[];
  units: Record<string, string>;
  [key: string]: any;
}

export interface WindyHourlyPoint {
  timestamp: number;
  windSpeedKnots?: number;
  windDirectionDeg?: number;
  gustKnots?: number;
  waveHeightFt?: number;
  wavePeriodSec?: number;
  waveDirectionDeg?: number;
  temperatureF?: number;
  pressureHpa?: number;
  precipMm?: number;
}

export interface WindyForecast {
  model: WindyModel;
  fetchedAt: number;
  position: Position;
  hourly: WindyHourlyPoint[];
  /** True if wave data was requested but unavailable */
  waveDataUnavailable?: boolean;
}

const MS_TO_KNOTS = 1.9438;
const M_TO_FT = 3.28084;
const K_TO_F = (k: number) => (k - 273.15) * (9 / 5) + 32;

function degreesFromUV(u: number, v: number): number {
  const dir = (Math.atan2(-u, -v) * 180) / Math.PI;
  return (dir + 360) % 360;
}

function speedFromUV(u: number, v: number): number {
  return Math.sqrt(u * u + v * v);
}

// =========================================================================
// FORECAST CACHE — prevents inconsistent results on repeated calls
// =========================================================================
interface CacheEntry {
  forecast: WindyForecast;
  expiresAt: number;
}

/** Persisted shape stored in Dexie windyCache table. */
export interface WindyCacheEntry {
  key: string;
  forecast: WindyForecast;
  expiresAt: number;
  fetchedAt: number;
}

const forecastCache = new Map<string, CacheEntry>();

/** Round lat/lng to 2 decimal places (~1.1 km) for cache deduplication.
 *  Points within ~1 km of each other will share the same forecast, which
 *  is appropriate since GFS grid resolution is ~25 km anyway. */
function cacheKey(lat: number, lng: number, model: string): string {
  return `${lat.toFixed(2)},${lng.toFixed(2)},${model}`;
}

/** L1 (in-memory) lookup. Synchronous fast path. */
function getMemCached(key: string): WindyForecast | null {
  const entry = forecastCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    forecastCache.delete(key);
    return null;
  }
  return entry.forecast;
}

/** L1 + L2 lookup. Falls back to Dexie if Map is empty (e.g. after page reload). */
async function getCached(key: string): Promise<WindyForecast | null> {
  const mem = getMemCached(key);
  if (mem) return mem;

  try {
    const row = await db.windyCache.get(key);
    if (!row) return null;
    if (Date.now() > row.expiresAt) {
      await db.windyCache.delete(key).catch(() => {});
      return null;
    }
    forecastCache.set(key, { forecast: row.forecast, expiresAt: row.expiresAt });
    return row.forecast;
  } catch {
    return null;
  }
}

function setCache(key: string, forecast: WindyForecast): void {
  const expiresAt = Date.now() + CACHE_TTL_MS;
  forecastCache.set(key, { forecast, expiresAt });
  // Fire-and-forget DB write — failures must not block the caller, but log them so we
  // notice if persistence quietly stops working (the whole point of this cache is determinism).
  db.windyCache
    .put({ key, forecast, expiresAt, fetchedAt: forecast.fetchedAt })
    .catch((err) => console.error('[windyCache] persist failed', err));
}

/** Clear the entire forecast cache (both tiers). Call when user wants fresh data. */
export async function clearWindyCache(): Promise<void> {
  forecastCache.clear();
  try {
    await db.windyCache.clear();
  } catch (err) {
    console.error('[windyCache] clear failed', err);
  }
}

/** Timestamp of the most recent API fetch, or null. Used to show "data from X:XX" in UI. */
export function getLastFetchTime(): number | null {
  let latest = 0;
  for (const entry of forecastCache.values()) {
    if (entry.forecast.fetchedAt > latest) latest = entry.forecast.fetchedAt;
  }
  return latest || null;
}

// =========================================================================
// API FETCH FUNCTIONS (with caching + retry)
// =========================================================================

async function fetchWithRetry(body: WindyRequest, retries = 2): Promise<WindyRawResponse> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(WINDY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Windy API error ${res.status}: ${text || res.statusText}`);
      }
      return await res.json();
    } catch (err) {
      lastError = err as Error;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
  throw lastError!;
}

/** Fetch basic wind + gust + temp + pressure from Windy for a single point.
 *  Results are cached for 30 minutes. */
export async function fetchWindyPointForecast(
  position: Position,
  apiKey: string,
  model: WindyModel = 'gfs'
): Promise<WindyForecast> {
  if (!apiKey) throw new Error('Windy API key not configured');

  const key = cacheKey(position.lat, position.lng, model);
  const cached = await getCached(key);
  if (cached) return cached;

  const data = await fetchWithRetry({
    lat: position.lat,
    lon: position.lng,
    model,
    parameters: ['wind', 'windGust', 'temp', 'pressure', 'dewpoint'],
    levels: ['surface'],
    key: apiKey,
  });

  const forecast = parseWindyResponse(data, position, model);
  setCache(key, forecast);
  return forecast;
}

/** Fetch wave data from gfsWave model (separate call required).
 *  Results are cached for 30 minutes.
 *  On failure: retries twice, then returns a forecast with waveDataUnavailable=true
 *  (NOT silently empty — the assessment engine will see this flag). */
export async function fetchWindyWaves(
  position: Position,
  apiKey: string
): Promise<WindyForecast> {
  if (!apiKey) throw new Error('Windy API key not configured');

  const key = cacheKey(position.lat, position.lng, 'gfsWave');
  const cached = await getCached(key);
  if (cached) return cached;

  try {
    const data = await fetchWithRetry({
      lat: position.lat,
      lon: position.lng,
      model: 'gfsWave',
      parameters: ['waves'],
      levels: ['surface'],
      key: apiKey,
    });

    const forecast = parseWindyResponse(data, position, 'gfsWave');

    // Verify we actually got wave data
    if (forecast.hourly.length === 0 || !forecast.hourly.some((h) => h.waveHeightFt !== undefined)) {
      const empty: WindyForecast = {
        model: 'gfsWave',
        fetchedAt: Date.now(),
        position,
        hourly: [],
        waveDataUnavailable: true,
      };
      setCache(key, empty);
      return empty;
    }

    setCache(key, forecast);
    return forecast;
  } catch {
    // After retries failed — flag it clearly, don't pretend waves are 0
    const empty: WindyForecast = {
      model: 'gfsWave',
      fetchedAt: Date.now(),
      position,
      hourly: [],
      waveDataUnavailable: true,
    };
    setCache(key, empty);
    return empty;
  }
}

// =========================================================================
// RESPONSE PARSING
// =========================================================================

function parseWindyResponse(
  data: WindyRawResponse,
  position: Position,
  model: WindyModel
): WindyForecast {
  const timestamps: number[] = data.ts ?? [];
  const hourly: WindyHourlyPoint[] = [];

  const windU: number[] | undefined = data['wind_u-surface'];
  const windV: number[] | undefined = data['wind_v-surface'];
  const gust: number[] | undefined = data['gust-surface'];
  const temp: number[] | undefined = data['temp-surface'];
  const pressure: number[] | undefined = data['pressure-surface'];
  const wavesH: number[] | undefined = data['waves_height-surface'];
  const wavesP: number[] | undefined = data['waves_period-surface'];
  const wavesD: number[] | undefined = data['waves_direction-surface'];

  for (let i = 0; i < timestamps.length; i++) {
    const point: WindyHourlyPoint = { timestamp: timestamps[i] };

    if (windU && windV && windU[i] !== undefined && windV[i] !== undefined) {
      const speedMs = speedFromUV(windU[i], windV[i]);
      point.windSpeedKnots = speedMs * MS_TO_KNOTS;
      point.windDirectionDeg = degreesFromUV(windU[i], windV[i]);
    }

    if (gust && gust[i] !== undefined) {
      point.gustKnots = gust[i] * MS_TO_KNOTS;
    }

    if (temp && temp[i] !== undefined) {
      point.temperatureF = K_TO_F(temp[i]);
    }

    if (pressure && pressure[i] !== undefined) {
      point.pressureHpa = pressure[i] / 100;
    }

    if (wavesH && wavesH[i] !== undefined) {
      point.waveHeightFt = wavesH[i] * M_TO_FT;
    }

    if (wavesP && wavesP[i] !== undefined) {
      point.wavePeriodSec = wavesP[i];
    }

    if (wavesD && wavesD[i] !== undefined) {
      point.waveDirectionDeg = wavesD[i];
    }

    hourly.push(point);
  }

  return {
    model,
    fetchedAt: Date.now(),
    position,
    hourly,
  };
}

// =========================================================================
// UTILITY FUNCTIONS
// =========================================================================

/** Combine wind forecast with wave forecast by merging hourly arrays on timestamp */
export function mergeWindyForecasts(
  ...forecasts: WindyForecast[]
): WindyHourlyPoint[] {
  const byTimestamp = new Map<number, WindyHourlyPoint>();

  for (const f of forecasts) {
    for (const point of f.hourly) {
      const existing = byTimestamp.get(point.timestamp) ?? { timestamp: point.timestamp };
      byTimestamp.set(point.timestamp, { ...existing, ...point });
    }
  }

  return Array.from(byTimestamp.values()).sort((a, b) => a.timestamp - b.timestamp);
}

/** Find the Windy data point closest to a given target timestamp */
export function findClosestHourly(
  hourly: WindyHourlyPoint[],
  targetTimestampMs: number
): WindyHourlyPoint | null {
  if (hourly.length === 0) return null;
  let closest = hourly[0];
  let minDiff = Math.abs(closest.timestamp - targetTimestampMs);
  for (const p of hourly) {
    const diff = Math.abs(p.timestamp - targetTimestampMs);
    if (diff < minDiff) {
      minDiff = diff;
      closest = p;
    }
  }
  return closest;
}
