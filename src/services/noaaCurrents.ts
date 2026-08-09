import { db } from '../db/database';
import { parseNoaaGmt, localDateKey, type Utc } from '../utils/time';
import {
  currentCacheKey,
  isStale,
  type CurrentEvent,
  type CurrentPredictionRecord,
} from '../types/currents';

/**
 * NOAA CO-OPS tidal current predictions.
 *
 * Everything NOAA-shaped stops here: parameter names, field casing, their signed-velocity
 * convention and their timestamp format. The rest of the app sees CurrentEvent and
 * CurrentPredictionRecord and nothing else.
 *
 * Request shapes were verified against the live API rather than assumed — see
 * src/test/fixtures/noaa-*.json, which are literal captured responses.
 */

const DATA_GETTER = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';

export type CurrentInterval = 'MAX_SLACK' | '6';

/** A station from the bundled catalogue. */
export interface CurrentStationInfo {
  id: string;
  name: string;
  lat: number;
  lng: number;
  bins: number[];
  /** 'H' harmonic (independent predictions), 'S' subordinate (offsets from a reference). */
  type: string | null;
}

/* ── NOAA wire types — never exported ── */

interface NoaaCurrentPredictionRow {
  Time: string;
  Type?: string;
  Velocity_Major: number | string;
  Bin?: string | number;
  Depth?: string | number;
  meanFloodDir?: number | string;
  meanEbbDir?: number | string;
}

interface NoaaCurrentPredictionsBody {
  current_predictions?: { units?: string; cp?: NoaaCurrentPredictionRow[] };
  error?: { message?: string };
}

/* ── Station catalogue ── */

let catalogue: CurrentStationInfo[] | null = null;

/**
 * Loads the bundled station catalogue.
 *
 * Dynamically imported so ~290 KB of station data is a separate chunk rather than part of
 * the initial bundle, while still being precached by the service worker for offline use.
 */
export async function loadStationCatalogue(): Promise<CurrentStationInfo[]> {
  if (catalogue) return catalogue;
  const mod = (await import('../data/current-stations.json')) as unknown as {
    default: { stations: CurrentStationInfo[] };
  };
  catalogue = mod.default.stations;
  return catalogue;
}

export async function findStationById(id: string): Promise<CurrentStationInfo | undefined> {
  return (await loadStationCatalogue()).find((s) => s.id === id);
}

/**
 * Picks the depth bin to use for a station.
 *
 * Bin 1 is the surface bin at every station in the catalogue. A sailboat's keel sits in
 * the upper few metres, so the surface bin is the honest default; mid-column bins report
 * different speeds and would flatter or exaggerate the transit.
 */
export function defaultBin(station: CurrentStationInfo): number {
  return station.bins.length > 0 ? Math.min(...station.bins) : 1;
}

/* ── Fetching ── */

function yyyymmdd(utc: Utc): string {
  const d = new Date(utc);
  return (
    d.getUTCFullYear().toString() +
    String(d.getUTCMonth() + 1).padStart(2, '0') +
    String(d.getUTCDate()).padStart(2, '0')
  );
}

export class NoaaCurrentsError extends Error {
  /** True for transport failures worth another attempt; false for a bad request. */
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = 'NoaaCurrentsError';
    this.retryable = retryable;
  }
}

const RETRY_DELAYS_MS = [400, 1200, 3000];

async function fetchJson(url: string): Promise<NoaaCurrentPredictionsBody> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]));
    }
    let resp: Response;
    try {
      resp = await fetch(url);
    } catch (err) {
      // Network failure — worth retrying.
      lastError = err as Error;
      continue;
    }

    // 4xx is a bad request; retrying an identical bad request is pointless.
    if (resp.status >= 400 && resp.status < 500) {
      throw new NoaaCurrentsError(`NOAA rejected the request (${resp.status})`, false);
    }
    if (!resp.ok) {
      lastError = new Error(`NOAA returned ${resp.status}`);
      continue;
    }
    return (await resp.json()) as NoaaCurrentPredictionsBody;
  }

  throw new NoaaCurrentsError(
    `NOAA unreachable after ${RETRY_DELAYS_MS.length + 1} attempts: ${lastError?.message ?? 'unknown'}`,
    true
  );
}

/**
 * Converts a NOAA response body into cache-ready form.
 *
 * Exported for tests, which drive it from the captured fixtures rather than the network.
 */
export function parsePredictionBody(
  body: NoaaCurrentPredictionsBody,
  meta: { stationId: string; bin: number; interval: CurrentInterval; dateKey: string; fetchedAt: Utc }
): CurrentPredictionRecord {
  if (body.error?.message) {
    // NOAA returns HTTP 200 with an error object for things like a bad station id.
    throw new NoaaCurrentsError(`NOAA: ${body.error.message.trim()}`, false);
  }

  const rows = body.current_predictions?.cp ?? [];
  const events: CurrentEvent[] = rows.map((row) => {
    const velocityKn = Number(row.Velocity_Major);
    if (!Number.isFinite(velocityKn)) {
      throw new NoaaCurrentsError(`NOAA returned a non-numeric velocity: ${row.Velocity_Major}`, false);
    }
    return { at: parseNoaaGmt(row.Time), velocityKn, kind: classify(row, velocityKn) };
  });

  const first = rows[0];
  return {
    key: currentCacheKey(meta.stationId, meta.bin, meta.interval, meta.dateKey),
    stationId: meta.stationId,
    bin: meta.bin,
    interval: meta.interval,
    dateKey: meta.dateKey,
    fetchedAt: meta.fetchedAt,
    meanFloodDirDeg: numOrNull(first?.meanFloodDir),
    meanEbbDirDeg: numOrNull(first?.meanEbbDir),
    events: events.sort((a, b) => a.at - b.at),
  };
}

function numOrNull(v: number | string | undefined): number | null {
  if (v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * MAX_SLACK rows carry an explicit Type; the 6-minute series does not, so it is derived
 * from the sign of the velocity along the station's major axis (positive flood).
 */
function classify(row: NoaaCurrentPredictionRow, velocityKn: number): CurrentEvent['kind'] {
  const declared = (row.Type ?? '').toLowerCase();
  if (declared.startsWith('slack')) return 'slack';
  if (declared.startsWith('flood')) return 'flood';
  if (declared.startsWith('ebb')) return 'ebb';
  if (Math.abs(velocityKn) < 0.1) return 'slack';
  return velocityKn > 0 ? 'flood' : 'ebb';
}

/**
 * Returns one local day of predictions, from cache when present.
 *
 * `forceRefresh` re-fetches; otherwise a cached day is returned regardless of age so the
 * app keeps working offline. Staleness is reported via `isStale`, not enforced here —
 * old data beats no data at anchor, provided the UI says how old it is.
 */
export async function getDayPredictions(
  stationId: string,
  bin: number,
  interval: CurrentInterval,
  dayUtc: Utc,
  opts: { forceRefresh?: boolean } = {}
): Promise<CurrentPredictionRecord> {
  const dateKey = localDateKey(dayUtc);
  const key = currentCacheKey(stationId, bin, interval, dateKey);

  if (!opts.forceRefresh) {
    const cached = await db.currentPredictions.get(key);
    if (cached) return cached;
  }

  // Request a day either side in NOAA's own (GMT) days so the local day is fully covered
  // whatever the offset, then keep only what falls inside the local day.
  const params = new URLSearchParams({
    product: 'currents_predictions',
    station: stationId,
    bin: String(bin),
    begin_date: yyyymmdd(dayUtc - 86_400_000),
    end_date: yyyymmdd(dayUtc + 86_400_000),
    units: 'english',
    time_zone: 'gmt',
    format: 'json',
    interval,
  });

  const body = await fetchJson(`${DATA_GETTER}?${params.toString()}`);
  const record = parsePredictionBody(body, {
    stationId,
    bin,
    interval,
    dateKey,
    fetchedAt: Date.now(),
  });
  record.events = record.events.filter((e) => localDateKey(e.at) === dateKey);

  await db.currentPredictions.put(record).catch(() => {
    // Cache writes are best-effort; a failure here must not break planning.
  });
  return record;
}

/** Cached record without fetching — the offline path. Null when absent. */
export async function getCachedDay(
  stationId: string,
  bin: number,
  interval: CurrentInterval,
  dayUtc: Utc
): Promise<CurrentPredictionRecord | null> {
  const key = currentCacheKey(stationId, bin, interval, localDateKey(dayUtc));
  return (await db.currentPredictions.get(key)) ?? null;
}

/**
 * Warms the cache for a station across a span of days (spec §3: prefetch planned date ±2).
 * Returns how many days were fetched and how many failed, rather than throwing — a
 * partial prefetch is still useful.
 */
export async function prefetchDays(
  stationId: string,
  bin: number,
  interval: CurrentInterval,
  dayUtcs: Utc[]
): Promise<{ fetched: number; failed: number }> {
  let fetched = 0;
  let failed = 0;
  for (const day of dayUtcs) {
    try {
      await getDayPredictions(stationId, bin, interval, day);
      fetched++;
    } catch {
      failed++;
    }
  }
  return { fetched, failed };
}

/** Age of the oldest cached record backing a set of stations, for the staleness badge. */
export async function oldestCacheAge(records: CurrentPredictionRecord[]): Promise<number | null> {
  if (records.length === 0) return null;
  return Date.now() - Math.min(...records.map((r) => r.fetchedAt));
}

export { isStale };
