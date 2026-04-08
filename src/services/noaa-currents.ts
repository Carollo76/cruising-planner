import type { Position } from '../types/navigation';
import { db } from '../db/database';
import { distanceNM } from '../utils/navigation-math';

/** NOAA Tidal Currents API client.
 *  Docs: https://api.tidesandcurrents.noaa.gov/api/prod/
 *  Returns time-series of current speed and direction at a station. */

const NOAA_ENDPOINT = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';

export interface CurrentStation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** Critical = passages where currents significantly affect transit time/safety */
  critical?: boolean;
  /** Short description of what makes this passage important */
  description?: string;
}

/** Hand-picked critical currents stations for Long Island Sound cruising.
 *  Station IDs verified against tidesandcurrents.noaa.gov.
 *  "critical" stations generate warnings in the assessment engine. */
export const LI_SOUND_CURRENT_STATIONS: CurrentStation[] = [
  {
    id: 'ACT3876',
    name: 'Hell Gate',
    lat: 40.7792,
    lng: -73.9344,
    critical: true,
    description: 'Critical passage between East River and Long Island Sound. Currents up to 5 kt — transit only near slack or with favorable tide.',
  },
  {
    id: 'ACT3896',
    name: 'Throgs Neck',
    lat: 40.8067,
    lng: -73.7933,
    description: 'Western Long Island Sound entrance. Moderate currents.',
  },
  {
    id: 'ACT4011',
    name: 'Execution Rocks',
    lat: 40.8820,
    lng: -73.7322,
    description: 'Western LI Sound, off New Rochelle.',
  },
  {
    id: 'ACT4531',
    name: 'The Race',
    lat: 41.2333,
    lng: -72.0533,
    critical: true,
    description: 'Critical passage between LI Sound and Block Island Sound. Currents up to 4+ kt — time your transit with the tide.',
  },
  {
    id: 'ACT4576',
    name: 'Plum Gut',
    lat: 41.1700,
    lng: -72.2100,
    critical: true,
    description: 'Critical narrow passage at east end of LI Sound. Strong currents up to 4+ kt, standing waves on ebb against wind.',
  },
  {
    id: 'ACT4541',
    name: 'Fishers Island Sound',
    lat: 41.3017,
    lng: -71.9750,
    description: 'Between Fishers Island and CT mainland.',
  },
  {
    id: 'ACT3826',
    name: 'Stepping Stones Light',
    lat: 40.8264,
    lng: -73.7753,
    description: 'Western LI Sound near City Island.',
  },
];

export interface CurrentDataPoint {
  timestamp: number; // Unix ms (UTC)
  speedKnots: number; // negative = flood (incoming/westbound typically), positive = ebb (outgoing/eastbound)
  directionDeg: number;
  /** Absolute speed regardless of direction */
  absSpeedKnots: number;
  type: 'flood' | 'ebb' | 'slack';
}

export interface CurrentPrediction {
  stationId: string;
  stationName: string;
  fetchedAt: number;
  data: CurrentDataPoint[];
}

function yyyymmdd(date: Date): string {
  return (
    date.getFullYear().toString() +
    (date.getMonth() + 1).toString().padStart(2, '0') +
    date.getDate().toString().padStart(2, '0')
  );
}

/** Fetch tidal current predictions for a station across a date range.
 *  Uses 6-minute interval predictions. Free, no API key required. */
export async function fetchCurrentPredictions(
  station: CurrentStation,
  startDate: Date,
  endDate: Date
): Promise<CurrentPrediction> {
  const params = new URLSearchParams({
    product: 'currents_predictions',
    station: station.id,
    begin_date: yyyymmdd(startDate),
    end_date: yyyymmdd(endDate),
    units: 'english',
    time_zone: 'gmt',
    format: 'json',
    interval: '30', // 30-minute intervals (lighter payload)
  });

  const url = `${NOAA_ENDPOINT}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`NOAA currents fetch failed for ${station.name}: ${res.status}`);
  }

  const json = await res.json();
  if (json.error) {
    throw new Error(`NOAA currents error for ${station.name}: ${json.error.message}`);
  }

  const predictions: any[] = json.current_predictions?.cp ?? [];
  const data: CurrentDataPoint[] = predictions.map((p) => {
    // velocity_major is signed speed along the axis (+ flood, - ebb) OR
    // some stations report "Velocity_Major". Handle both.
    const velocity = parseFloat(p.Velocity_Major ?? p.velocity_major ?? p.s ?? '0');
    const direction = parseFloat(p.Bin ?? p.direction ?? p.d ?? '0');
    const absSpeed = Math.abs(velocity);
    const typeStr: string = (p.Type ?? p.type ?? '').toLowerCase();
    let type: 'flood' | 'ebb' | 'slack';
    if (absSpeed < 0.1) type = 'slack';
    else if (typeStr.startsWith('f')) type = 'flood';
    else if (typeStr.startsWith('e')) type = 'ebb';
    else type = velocity >= 0 ? 'flood' : 'ebb';

    return {
      timestamp: new Date(p.Time + 'Z').getTime(),
      speedKnots: velocity,
      directionDeg: direction,
      absSpeedKnots: absSpeed,
      type,
    };
  });

  const prediction: CurrentPrediction = {
    stationId: station.id,
    stationName: station.name,
    fetchedAt: Date.now(),
    data: data.sort((a, b) => a.timestamp - b.timestamp),
  };

  // Cache in IndexedDB so repeat assessments on the same day don't re-fetch
  await db.tideCache.put({
    stationId: station.id,
    stationName: station.name,
    predictions: data.map((d) => ({
      timestamp: new Date(d.timestamp).toISOString(),
      height: d.speedKnots, // reuse tide cache schema — stored as signed knots here
      type: d.type === 'flood' ? 'H' : d.type === 'ebb' ? 'L' : undefined,
    })),
    fetchedAt: Date.now(),
  }).catch(() => {
    // cache write is best-effort
  });

  return prediction;
}

/** Find stations within maxDistanceNM of any point along a route.
 *  Returns stations sorted by closest approach distance. */
export function findRelevantCurrentStations(
  waypoints: Position[],
  maxDistanceNM = 5
): Array<CurrentStation & { distanceFromRouteNM: number }> {
  const results: Array<CurrentStation & { distanceFromRouteNM: number }> = [];

  for (const station of LI_SOUND_CURRENT_STATIONS) {
    const stationPos: Position = { lat: station.lat, lng: station.lng };
    let minDist = Infinity;
    for (const wp of waypoints) {
      const d = distanceNM(wp, stationPos);
      if (d < minDist) minDist = d;
    }
    if (minDist <= maxDistanceNM) {
      results.push({ ...station, distanceFromRouteNM: minDist });
    }
  }

  return results.sort((a, b) => a.distanceFromRouteNM - b.distanceFromRouteNM);
}

/** Find the closest prediction data point to a target timestamp */
export function findCurrentAtTime(
  prediction: CurrentPrediction,
  targetTimestampMs: number
): CurrentDataPoint | null {
  if (prediction.data.length === 0) return null;
  let best = prediction.data[0];
  let minDiff = Math.abs(best.timestamp - targetTimestampMs);
  for (const p of prediction.data) {
    const diff = Math.abs(p.timestamp - targetTimestampMs);
    if (diff < minDiff) {
      minDiff = diff;
      best = p;
    }
  }
  return best;
}

/** Find next slack water after a given time */
export function findNextSlackWater(
  prediction: CurrentPrediction,
  afterTimestampMs: number
): CurrentDataPoint | null {
  const upcoming = prediction.data.filter(
    (d) => d.timestamp >= afterTimestampMs && d.type === 'slack'
  );
  return upcoming[0] ?? null;
}

/** Find the best window for transiting this station given a target arrival time.
 *  Returns favorable windows: slack water ± 2hr, or strong current in your direction. */
export interface CurrentTransitWindow {
  stationId: string;
  stationName: string;
  windowStart: number;
  windowEnd: number;
  peakSpeedKnots: number;
  type: 'slack' | 'flood' | 'ebb';
  recommendation: string;
}

export function findFavorableTransitWindows(
  prediction: CurrentPrediction,
  fromTimestampMs: number,
  hoursAhead = 12
): CurrentTransitWindow[] {
  const endMs = fromTimestampMs + hoursAhead * 60 * 60 * 1000;
  const inRange = prediction.data.filter(
    (d) => d.timestamp >= fromTimestampMs && d.timestamp <= endMs
  );

  const windows: CurrentTransitWindow[] = [];
  const slacks = inRange.filter((d) => d.type === 'slack');

  for (const slack of slacks) {
    windows.push({
      stationId: prediction.stationId,
      stationName: prediction.stationName,
      windowStart: slack.timestamp - 60 * 60 * 1000, // 1hr before slack
      windowEnd: slack.timestamp + 60 * 60 * 1000, // 1hr after slack
      peakSpeedKnots: 0.5,
      type: 'slack',
      recommendation: `Transit near slack water at ${new Date(slack.timestamp).toLocaleString()}`,
    });
  }

  return windows;
}
