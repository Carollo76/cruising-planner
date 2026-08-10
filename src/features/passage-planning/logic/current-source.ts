import type { Position } from '../../../types/navigation';
import { distanceNM } from '../../../utils/navigation-math';
import { localDateKey, type Utc } from '../../../utils/time';
import type { CurrentPredictionRecord } from '../../../types/currents';
import { getDayPredictions, getCachedDay } from '../../../services/noaaCurrents';
import type { CurrentSample, CurrentLookup } from './propagation';
import type { GateTransit } from './matching';

/**
 * Turns cached NOAA predictions into the lookup the solver walks the route with.
 *
 * Two jobs the solver should not know about: deciding how far a gate's influence reaches,
 * and interpolating between six-minute samples. Everything here works from the Dexie
 * cache, so a solve runs identically offline once a prefetch has happened.
 */

/**
 * How far from a gate its current is applied.
 *
 * Deliberately larger than the match radius. Matching answers "does the boat go through
 * here", which should be tight; influence answers "is the boat's speed affected", which
 * extends well beyond the narrows — the ebb pouring out of Plum Gut is still moving water
 * several miles into Gardiners Bay. Beyond this the model says nothing rather than
 * extrapolating a station across open water it does not describe.
 */
export const GATE_INFLUENCE_NM = 6;

export interface GateCurrentData {
  transit: GateTransit;
  /** Six-minute series for each day covered, oldest first. */
  records: CurrentPredictionRecord[];
}

/** Days spanned by a planning window, plus a margin either side (spec §3: date ±2). */
export function daysToCover(from: Utc, to: Utc, marginDays = 2): Utc[] {
  const day = 86_400_000;
  const start = from - marginDays * day;
  const end = to + marginDays * day;
  const seen = new Set<string>();
  const days: Utc[] = [];
  for (let t = start; t <= end; t += day) {
    const key = localDateKey(t);
    if (!seen.has(key)) {
      seen.add(key);
      days.push(t);
    }
  }
  return days;
}

/**
 * Fetches and caches everything the gates on this route need.
 *
 * Reports what failed rather than throwing: a partial prefetch still lets the solver run
 * over the days it did get, and the UI can say which ones are missing.
 */
export async function prefetchGateCurrents(
  transits: GateTransit[],
  from: Utc,
  to: Utc
): Promise<{ data: GateCurrentData[]; failures: string[] }> {
  const days = daysToCover(from, to);
  const data: GateCurrentData[] = [];
  const failures: string[] = [];

  for (const transit of transits) {
    const records: CurrentPredictionRecord[] = [];
    for (const day of days) {
      try {
        records.push(
          await getDayPredictions(transit.gate.stationId, transit.gate.bin, '6', day)
        );
      } catch (err) {
        failures.push(`${transit.gate.name} ${localDateKey(day)}: ${(err as Error).message}`);
      }
    }
    data.push({ transit, records });
  }

  return { data, failures };
}

/** Reads whatever is already cached, without touching the network. */
export async function loadCachedGateCurrents(
  transits: GateTransit[],
  from: Utc,
  to: Utc
): Promise<GateCurrentData[]> {
  const days = daysToCover(from, to);
  const data: GateCurrentData[] = [];

  for (const transit of transits) {
    const records: CurrentPredictionRecord[] = [];
    for (const day of days) {
      const record = await getCachedDay(transit.gate.stationId, transit.gate.bin, '6', day);
      if (record) records.push(record);
    }
    data.push({ transit, records });
  }
  return data;
}

/**
 * Linear interpolation between the two samples bracketing an instant.
 *
 * NOAA's six-minute series is fine enough that this adds nothing dramatic, but stepping
 * to the nearest sample would quantise arrival current in six-minute jumps and make the
 * solver's ranking jitter between adjacent departures for no physical reason.
 */
export function interpolateVelocity(record: CurrentPredictionRecord, at: Utc): number | null {
  const events = record.events;
  if (events.length === 0) return null;
  if (at <= events[0].at) return events[0].velocityKn;
  if (at >= events[events.length - 1].at) return events[events.length - 1].velocityKn;

  for (let i = 1; i < events.length; i++) {
    if (events[i].at >= at) {
      const a = events[i - 1];
      const b = events[i];
      const span = b.at - a.at;
      if (span <= 0) return a.velocityKn;
      const t = (at - a.at) / span;
      return a.velocityKn + t * (b.velocityKn - a.velocityKn);
    }
  }
  return null;
}

/**
 * Builds the solver's current lookup from cached gate data.
 *
 * Returns null away from every gate, which the propagation model reads as "no current
 * applied" and reports through `hadMissingCurrentData`. That is deliberate: the spec puts
 * current modelling anywhere other than the defined gates out of scope, and inventing a
 * mid-Sound current would be exactly the kind of confident wrongness to avoid.
 */
export function buildCurrentLookup(data: GateCurrentData[]): CurrentLookup {
  return (position: Position, at: Utc): CurrentSample | null => {
    let nearest: GateCurrentData | null = null;
    let nearestDistance = Infinity;

    for (const entry of data) {
      const d = distanceNM(position, entry.transit.gate.position);
      if (d < nearestDistance && d <= GATE_INFLUENCE_NM) {
        nearest = entry;
        nearestDistance = d;
      }
    }
    if (!nearest) return null;

    const dayKey = localDateKey(at);
    const record = nearest.records.find((r) => r.dateKey === dayKey);
    if (!record) return null;

    const velocity = interpolateVelocity(record, at);
    if (velocity === null) return null;

    const floodDir = record.meanFloodDirDeg;
    const ebbDir = record.meanEbbDirDeg;
    if (floodDir === null || ebbDir === null) return null;

    // Taper the current toward the edge of the gate's influence rather than dropping it
    // off a cliff, which would make ETAs jump for a boat passing just inside the radius.
    const taper = 1 - Math.min(1, nearestDistance / GATE_INFLUENCE_NM) ** 2;
    const tapered = velocity * taper;

    return {
      signedKn: tapered,
      directionDeg: tapered >= 0 ? floodDir : ebbDir,
      kind: Math.abs(tapered) < 0.1 ? 'slack' : tapered > 0 ? 'flood' : 'ebb',
    };
  };
}

/** Slack and peak events for a day, for drawing the timeline band. */
export function timelineEvents(
  record: CurrentPredictionRecord
): Array<{ at: Utc; velocityKn: number; kind: 'flood' | 'ebb' | 'slack' }> {
  const events = record.events;
  if (events.length === 0) return [];

  const marks: Array<{ at: Utc; velocityKn: number; kind: 'flood' | 'ebb' | 'slack' }> = [];
  for (let i = 1; i < events.length - 1; i++) {
    const previous = Math.abs(events[i - 1].velocityKn);
    const current = Math.abs(events[i].velocityKn);
    const next = Math.abs(events[i + 1].velocityKn);

    // Local peak in either direction.
    if (current >= previous && current > next && current > 0.2) {
      marks.push({ at: events[i].at, velocityKn: events[i].velocityKn, kind: events[i].kind });
    }
    // Zero crossing: slack.
    if (Math.sign(events[i - 1].velocityKn) !== Math.sign(events[i].velocityKn)) {
      marks.push({ at: events[i].at, velocityKn: 0, kind: 'slack' });
    }
  }
  return marks;
}
