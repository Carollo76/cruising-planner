import type { Utc } from '../utils/time';

/** A slack/max-flood/max-ebb event, or one sample of the 6-minute series. */
export interface CurrentEvent {
  /** Absolute instant. Never a local wall-clock string — see utils/time. */
  at: Utc;
  /** Signed speed along the station's major axis: positive flood, negative ebb. */
  velocityKn: number;
  kind: 'flood' | 'ebb' | 'slack';
}

/**
 * One day of predictions for one station/bin/interval.
 *
 * The spec asks for a cache keyed by station + bin + date. Interval is part of the key
 * too: MAX_SLACK events and the 6-minute series are different payloads for the same
 * station and day, and conflating them would have one silently evict the other.
 */
export interface CurrentPredictionRecord {
  /** `${stationId}:${bin}:${interval}:${dateKey}` */
  key: string;
  stationId: string;
  bin: number;
  interval: 'MAX_SLACK' | '6';
  /** Local calendar date in the boat's zone, `YYYY-MM-DD`. */
  dateKey: string;
  fetchedAt: Utc;
  /** Station's mean flood/ebb axis in degrees true, as reported by NOAA with the data. */
  meanFloodDirDeg: number | null;
  meanEbbDirDeg: number | null;
  events: CurrentEvent[];
}

export function currentCacheKey(
  stationId: string,
  bin: number,
  interval: 'MAX_SLACK' | '6',
  dateKey: string
): string {
  return `${stationId}:${bin}:${interval}:${dateKey}`;
}

/** Predictions older than this get a staleness badge in the UI (spec §3). */
export const STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

export function isStale(record: CurrentPredictionRecord, now: Utc = Date.now()): boolean {
  return now - record.fetchedAt > STALE_AFTER_MS;
}
