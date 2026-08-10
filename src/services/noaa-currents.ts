import type { Position } from '../types/navigation';
import { closestApproachToRoute } from '../utils/route-geometry';
import { localDateKey, type Utc } from '../utils/time';
import { getDayPredictions } from './noaaCurrents';

/**
 * Tidal currents for the Go/No-Go assessment engine.
 *
 * This is now a thin adapter over `noaaCurrents.ts`, kept because the assessment engine
 * consumes this shape. Rewriting it fixed three defects that had been feeding the safety
 * feature quietly wrong answers:
 *
 * 1. The station IDs were wrong. The Race was ACT4531 and Plum Gut ACT4576, neither of
 *    which is the current-prediction station for that passage — so the engine's warnings
 *    about the two most dangerous gates on the Sound were based on the wrong water.
 * 2. Current *direction* was parsed from NOAA's `Bin` field, which is the depth-bin
 *    index. Direction was therefore the number 1, 7 or 10 rather than a heading.
 * 3. Stations were matched by distance to waypoints, so a station beside a long leg was
 *    missed entirely — on the real Block Island route The Race is 7.2 NM from the nearest
 *    waypoint while the track passes 3.35 NM off it.
 *
 * Predictions are also now cached in the `currentPredictions` table instead of being
 * written into `tideCache`'s `height` field, which was for water levels.
 */

export interface CurrentStation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** NOAA depth bin. Bin 1 is the surface, which is where a sailboat's keel is. */
  bin: number;
  /** Passages where current materially affects transit safety, not just timing. */
  critical?: boolean;
  description?: string;
}

/**
 * Current-prediction stations relevant to Long Island Sound cruising.
 *
 * IDs and bins verified against the NOAA metadata API — see
 * `scripts/build-current-stations.mjs` and `src/data/current-stations.json`.
 */
export const LI_SOUND_CURRENT_STATIONS: CurrentStation[] = [
  {
    id: 'NYH1924',
    name: 'Hell Gate',
    lat: 40.7783,
    lng: -73.9383,
    bin: 1,
    critical: true,
    description:
      'Critical passage between the East River and Long Island Sound. Up to 5 kt — transit near slack or with a fair tide.',
  },
  {
    id: 'LIS1038',
    name: 'Throgs Neck Bridge',
    lat: 40.80105,
    lng: -73.7921,
    bin: 1,
    description: 'Western Long Island Sound entrance. Moderate currents.',
  },
  {
    id: 'LIS1001',
    name: 'The Race',
    lat: 41.22818,
    lng: -72.06252,
    bin: 1,
    critical: true,
    description:
      'Critical passage between Long Island Sound and Block Island Sound. Over 3 kt — time the transit with the tide.',
  },
  {
    id: 'LIS1012',
    name: 'Plum Gut',
    lat: 41.15917,
    lng: -72.2075,
    bin: 1,
    critical: true,
    description:
      'Critical narrow passage at the east end of the Sound. Over 3 kt, with standing waves on an ebb against easterly wind.',
  },
];

export interface CurrentDataPoint {
  /** Unix ms, UTC. */
  timestamp: number;
  /** Signed along the station's major axis: positive flood, negative ebb. */
  speedKnots: number;
  /** Direction the water sets toward, degrees true. */
  directionDeg: number;
  absSpeedKnots: number;
  type: 'flood' | 'ebb' | 'slack';
}

export interface CurrentPrediction {
  stationId: string;
  stationName: string;
  fetchedAt: number;
  data: CurrentDataPoint[];
}

/** Local days covered by a range, inclusive. */
function daysBetween(start: Utc, end: Utc): Utc[] {
  const day = 86_400_000;
  const seen = new Set<string>();
  const days: Utc[] = [];
  for (let t = start; t <= end + day; t += day) {
    const key = localDateKey(t);
    if (!seen.has(key)) {
      seen.add(key);
      days.push(t);
    }
  }
  return days;
}

/**
 * Predictions for a station across a date range.
 *
 * Backed by the cached six-minute series, so a repeat assessment on the same day does no
 * network work and an assessment at anchor works entirely from cache.
 */
export async function fetchCurrentPredictions(
  station: CurrentStation,
  startDate: Date,
  endDate: Date
): Promise<CurrentPrediction> {
  const data: CurrentDataPoint[] = [];
  let fetchedAt = Date.now();

  for (const day of daysBetween(startDate.getTime(), endDate.getTime())) {
    const record = await getDayPredictions(station.id, station.bin, '6', day);
    fetchedAt = Math.min(fetchedAt, record.fetchedAt);

    for (const event of record.events) {
      // Direction comes from the station's reported flood/ebb axis, which arrives with
      // the predictions — not from the bin index, as this module used to do.
      const directionDeg =
        event.velocityKn >= 0 ? (record.meanFloodDirDeg ?? 0) : (record.meanEbbDirDeg ?? 0);
      data.push({
        timestamp: event.at,
        speedKnots: event.velocityKn,
        directionDeg,
        absSpeedKnots: Math.abs(event.velocityKn),
        type: event.kind,
      });
    }
  }

  return {
    stationId: station.id,
    stationName: station.name,
    fetchedAt,
    data: data.sort((a, b) => a.timestamp - b.timestamp),
  };
}

/**
 * Stations whose water the route actually passes through.
 *
 * Measured to the track rather than to waypoints. The old waypoint-only version missed
 * The Race entirely on a route that passes 3.35 NM from it, because the leg carrying the
 * boat past it is 27 NM long with no waypoint nearby.
 */
export function findRelevantCurrentStations(
  waypoints: Position[],
  maxDistanceNM = 5
): Array<CurrentStation & { distanceFromRouteNM: number }> {
  if (waypoints.length < 2) return [];

  const results: Array<CurrentStation & { distanceFromRouteNM: number }> = [];
  for (const station of LI_SOUND_CURRENT_STATIONS) {
    const approach = closestApproachToRoute({ lat: station.lat, lng: station.lng }, waypoints);
    if (!approach || approach.distanceNm > maxDistanceNM) continue;
    results.push({ ...station, distanceFromRouteNM: approach.distanceNm });
  }
  return results.sort((a, b) => a.distanceFromRouteNM - b.distanceFromRouteNM);
}

/** Closest prediction to an instant, or null when the series does not reach it. */
export function findCurrentAtTime(
  prediction: CurrentPrediction,
  targetTimestampMs: number
): CurrentDataPoint | null {
  if (prediction.data.length === 0) return null;

  let best = prediction.data[0];
  let minDiff = Math.abs(best.timestamp - targetTimestampMs);
  for (const point of prediction.data) {
    const diff = Math.abs(point.timestamp - targetTimestampMs);
    if (diff < minDiff) {
      minDiff = diff;
      best = point;
    }
  }
  // Beyond an hour either side there is no usable prediction; saying nothing beats
  // reporting the current from a different tide.
  return minDiff <= 3_600_000 ? best : null;
}

/** First slack water after an instant. */
export function findNextSlackWater(
  prediction: CurrentPrediction,
  afterTimestampMs: number
): CurrentDataPoint | null {
  return (
    prediction.data.find((d) => d.timestamp >= afterTimestampMs && d.type === 'slack') ?? null
  );
}
