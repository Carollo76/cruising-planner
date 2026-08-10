import type { Position } from '../types/navigation';
import { distanceNM } from '../utils/navigation-math';
import { localDateKey, parseNoaaGmt, type Utc } from '../utils/time';
import { db } from '../db/database';

/**
 * Predicted water level, for deciding whether there is enough water to get in.
 *
 * Separate from the existing `noaa-tides.ts`, which fetches only from "now" forward and
 * returns local wall-clock strings — neither of which works for planning a day three
 * weeks out. Same shape as the currents client: NOAA's vocabulary stops here, everything
 * is UTC, and predictions are cached so a depth check works at anchor.
 */

const DATA_GETTER = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';

export interface TideStationInfo {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface TideHeightPoint {
  at: Utc;
  /** Feet above MLLW — the datum charted depths are referenced to. */
  heightFt: number;
}

export interface TideHeightRecord {
  /** `${stationId}:${dateKey}` */
  key: string;
  stationId: string;
  dateKey: string;
  fetchedAt: Utc;
  points: TideHeightPoint[];
}

interface NoaaPredictionsBody {
  predictions?: Array<{ t: string; v: string; type?: string }>;
  error?: { message?: string };
}

export class TideError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = 'TideError';
    this.retryable = retryable;
  }
}

/* ── Station catalogue ── */

let catalogue: TideStationInfo[] | null = null;

/** Bundled so a depth check works offline; dynamically imported to stay out of the shell. */
export async function loadTideStations(): Promise<TideStationInfo[]> {
  if (catalogue) return catalogue;
  const mod = (await import('../data/tide-stations.json')) as unknown as {
    default: { stations: TideStationInfo[] };
  };
  catalogue = mod.default.stations;
  return catalogue;
}

/**
 * Nearest tide station to a position, with how far away it is.
 *
 * The distance is returned rather than hidden because it matters: a station 20 NM away in
 * a different body of water is not a reliable proxy for the water over a bar, and the
 * caller should be able to say so.
 */
export async function nearestTideStation(
  position: Position
): Promise<{ station: TideStationInfo; distanceNm: number } | null> {
  const stations = await loadTideStations();
  if (stations.length === 0) return null;

  let best = stations[0];
  let bestDistance = Infinity;
  for (const station of stations) {
    const d = distanceNM(position, { lat: station.lat, lng: station.lng });
    if (d < bestDistance) {
      bestDistance = d;
      best = station;
    }
  }
  return { station: best, distanceNm: bestDistance };
}

/* ── Predictions ── */

export function tideCacheKey(stationId: string, dateKey: string): string {
  return `${stationId}:${dateKey}`;
}

function yyyymmdd(utc: Utc): string {
  const d = new Date(utc);
  return (
    d.getUTCFullYear().toString() +
    String(d.getUTCMonth() + 1).padStart(2, '0') +
    String(d.getUTCDate()).padStart(2, '0')
  );
}

/** Exported for tests, which drive it from a captured response rather than the network. */
export function parseTideBody(
  body: NoaaPredictionsBody,
  meta: { stationId: string; dateKey: string; fetchedAt: Utc }
): TideHeightRecord {
  if (body.error?.message) {
    throw new TideError(`NOAA: ${body.error.message.trim()}`, false);
  }

  const points: TideHeightPoint[] = [];
  for (const row of body.predictions ?? []) {
    const heightFt = Number(row.v);
    if (!Number.isFinite(heightFt)) {
      throw new TideError(`NOAA returned a non-numeric tide height: ${row.v}`, false);
    }
    points.push({ at: parseNoaaGmt(row.t), heightFt });
  }

  return {
    key: tideCacheKey(meta.stationId, meta.dateKey),
    stationId: meta.stationId,
    dateKey: meta.dateKey,
    fetchedAt: meta.fetchedAt,
    points: points.sort((a, b) => a.at - b.at),
  };
}

/** One local day of hourly heights, from cache when present. */
export async function getTideDay(
  stationId: string,
  dayUtc: Utc,
  opts: { forceRefresh?: boolean } = {}
): Promise<TideHeightRecord> {
  const dateKey = localDateKey(dayUtc);
  const key = tideCacheKey(stationId, dateKey);

  if (!opts.forceRefresh) {
    const cached = await db.tideHeights.get(key);
    if (cached) return cached;
  }

  const params = new URLSearchParams({
    product: 'predictions',
    station: stationId,
    begin_date: yyyymmdd(dayUtc - 86_400_000),
    end_date: yyyymmdd(dayUtc + 86_400_000),
    datum: 'MLLW',
    units: 'english',
    time_zone: 'gmt',
    format: 'json',
    interval: 'h',
  });

  let response: Response;
  try {
    response = await fetch(`${DATA_GETTER}?${params.toString()}`);
  } catch (err) {
    throw new TideError(`Could not reach NOAA tides: ${(err as Error).message}`, true);
  }
  if (response.status >= 400 && response.status < 500) {
    throw new TideError(`NOAA rejected the tide request (${response.status})`, false);
  }
  if (!response.ok) {
    throw new TideError(`NOAA tides returned ${response.status}`, true);
  }

  const record = parseTideBody((await response.json()) as NoaaPredictionsBody, {
    stationId,
    dateKey,
    fetchedAt: Date.now(),
  });
  record.points = record.points.filter((p) => localDateKey(p.at) === dateKey);

  await db.tideHeights.put(record).catch(() => {
    // Best effort; a failed cache write must not break the depth check.
  });
  return record;
}

/**
 * Height at an instant, interpolated between hourly samples.
 *
 * Returns null outside the record rather than holding the last value — the difference
 * between a falling tide and its last known height is exactly the error that puts a keel
 * in the mud.
 */
export function heightAt(record: TideHeightRecord, at: Utc): number | null {
  const points = record.points;
  if (points.length === 0) return null;
  if (at < points[0].at || at > points[points.length - 1].at) return null;

  for (let i = 1; i < points.length; i++) {
    if (points[i].at >= at) {
      const a = points[i - 1];
      const b = points[i];
      const span = b.at - a.at;
      if (span <= 0) return a.heightFt;
      const t = (at - a.at) / span;
      return a.heightFt + t * (b.heightFt - a.heightFt);
    }
  }
  return points[points.length - 1].heightFt;
}
