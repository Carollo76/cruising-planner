import type { TidePrediction, TideDataPoint, TideStation } from '../types/weather';
import { NOAA_CONFIG } from '../constants/noaa-config';
import { db } from '../db/database';

interface NOAAPredictionResponse {
  predictions: Array<{ t: string; v: string; type?: string }>;
}

function yyyymmdd(date: Date): string {
  return (
    date.getFullYear().toString() +
    (date.getMonth() + 1).toString().padStart(2, '0') +
    date.getDate().toString().padStart(2, '0')
  );
}

export async function getTidePredictions(
  stationId: string,
  stationName: string,
  days: number = 7
): Promise<TidePrediction> {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + days);

  const params = new URLSearchParams({
    product: 'predictions',
    station: stationId,
    begin_date: yyyymmdd(now),
    end_date: yyyymmdd(end),
    datum: 'MLLW',
    units: 'english',
    time_zone: 'lst_ldt',
    format: 'json',
    interval: 'hilo',
  });

  const url = `${NOAA_CONFIG.tides.baseUrl}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NOAA tides fetch failed: ${res.status}`);
  const data: NOAAPredictionResponse = await res.json();

  const predictions: TideDataPoint[] = data.predictions.map((p) => ({
    timestamp: p.t,
    height: parseFloat(p.v),
    type: p.type as 'H' | 'L' | undefined,
  }));

  const tidePrediction: TidePrediction = {
    stationId,
    stationName,
    predictions,
    fetchedAt: Date.now(),
  };

  await db.tideCache.put(tidePrediction);
  return tidePrediction;
}

/** Simple nearest-station search (brute force for now) */
export function findNearestStation(
  lat: number,
  lng: number,
  stations: TideStation[]
): TideStation | null {
  if (stations.length === 0) return null;

  let nearest = stations[0];
  let minDist = Infinity;

  for (const s of stations) {
    const dLat = s.lat - lat;
    const dLng = s.lng - lng;
    const distSq = dLat * dLat + dLng * dLng;
    if (distSq < minDist) {
      minDist = distSq;
      nearest = s;
    }
  }

  return nearest;
}
