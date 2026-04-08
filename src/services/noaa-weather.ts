import type { Position } from '../types/navigation';
import type { WeatherForecast, ForecastPeriod } from '../types/weather';
import { NOAA_CONFIG } from '../constants/noaa-config';
import { db } from '../db/database';
import { v4 as uuid } from 'uuid';

interface NOAAPointResponse {
  properties: {
    forecast: string;
    forecastHourly: string;
    forecastZone: string;
    forecastOffice: string;
    gridId: string;
  };
}

interface NOAAForecastResponse {
  properties: {
    periods: Array<{
      number: number;
      name: string;
      startTime: string;
      endTime: string;
      isDaytime: boolean;
      temperature: number;
      temperatureUnit: string;
      windSpeed: string;
      windDirection: string;
      shortForecast: string;
      detailedForecast: string;
      probabilityOfPrecipitation?: { value: number | null };
    }>;
  };
}

function parseWindSpeed(speedStr: string): { min?: number; max?: number } {
  const match = speedStr.match(/(\d+)(?:\s+to\s+(\d+))?\s*mph/i);
  if (!match) return {};
  const min = parseInt(match[1], 10);
  const max = match[2] ? parseInt(match[2], 10) : min;
  return { min, max };
}

export async function getForecast(position: Position): Promise<WeatherForecast> {
  const { lat, lng } = position;
  const pointUrl = `${NOAA_CONFIG.weather.baseUrl}/points/${lat.toFixed(4)},${lng.toFixed(4)}`;

  const pointRes = await fetch(pointUrl, {
    headers: { 'User-Agent': NOAA_CONFIG.weather.userAgent },
  });
  if (!pointRes.ok) throw new Error(`NOAA point lookup failed: ${pointRes.status}`);
  const pointData: NOAAPointResponse = await pointRes.json();

  const forecastRes = await fetch(pointData.properties.forecast, {
    headers: { 'User-Agent': NOAA_CONFIG.weather.userAgent },
  });
  if (!forecastRes.ok) throw new Error(`NOAA forecast failed: ${forecastRes.status}`);
  const forecastData: NOAAForecastResponse = await forecastRes.json();

  const periods: ForecastPeriod[] = forecastData.properties.periods.map((p) => {
    const { min, max } = parseWindSpeed(p.windSpeed);
    return {
      number: p.number,
      name: p.name,
      startTime: p.startTime,
      endTime: p.endTime,
      isDaytime: p.isDaytime,
      temperature: p.temperature,
      temperatureUnit: p.temperatureUnit as 'F' | 'C',
      windSpeed: p.windSpeed,
      windSpeedMin: min,
      windSpeedMax: max,
      windDirection: p.windDirection,
      shortForecast: p.shortForecast,
      detailedForecast: p.detailedForecast,
      probabilityOfPrecipitation: p.probabilityOfPrecipitation?.value ?? undefined,
    };
  });

  const forecast: WeatherForecast = {
    id: uuid(),
    position,
    forecastZoneId: pointData.properties.forecastZone.split('/').pop() || '',
    forecastOffice: pointData.properties.forecastOffice.split('/').pop() || '',
    fetchedAt: Date.now(),
    periods,
  };

  // Cache for offline access
  await db.weatherCache.put(forecast);

  return forecast;
}

/** Get cached forecast if fresh enough, otherwise fetch new */
export async function getForecastWithCache(position: Position): Promise<WeatherForecast> {
  const cached = await db.weatherCache
    .where('forecastZoneId')
    .above('')
    .reverse()
    .limit(10)
    .toArray();

  // Find the closest cached forecast
  const fresh = cached.find((c) => {
    const dLat = Math.abs(c.position.lat - position.lat);
    const dLng = Math.abs(c.position.lng - position.lng);
    const ageMs = Date.now() - c.fetchedAt;
    return dLat < 0.5 && dLng < 0.5 && ageMs < NOAA_CONFIG.weather.cacheDurationMs;
  });

  if (fresh) return fresh;

  try {
    return await getForecast(position);
  } catch (err) {
    // On network failure, return stale cache if any
    if (cached.length > 0) return cached[0];
    throw err;
  }
}
