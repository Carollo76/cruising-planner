import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWindResponse, windAt, leadDays, WindForecastError } from './openMeteoWind';
import { formatLocalTime } from '../utils/time';

const PLUM_GUT = { lat: 41.1592, lng: -72.2075 };

/** A literal Open-Meteo response, captured from the live API. */
function fixture() {
  return JSON.parse(readFileSync('src/test/fixtures/openmeteo-plumgut.json', 'utf8'));
}

describe('parsing a real Open-Meteo response', () => {
  const forecast = parseWindResponse(fixture(), PLUM_GUT, Date.UTC(2026, 7, 10));

  it('reads every hourly point', () => {
    expect(forecast.points).toHaveLength(48);
  });

  it('reads speed, gust and direction', () => {
    expect(forecast.points[0].speedKn).toBeCloseTo(11.1, 1);
    expect(forecast.points[0].directionDeg).toBe(251);
    expect(forecast.points[0].gustKn).toBeCloseTo(16.5, 1);
  });

  it('treats the timestamps as UTC, as requested', () => {
    // 2026-08-10T00:00 UTC is 20:00 the evening before in the boat's zone.
    expect(forecast.points[0].at).toBe(Date.UTC(2026, 7, 10, 0, 0));
    expect(formatLocalTime(forecast.points[0].at)).toBe('20:00');
  });

  it('returns points in chronological order', () => {
    const times = forecast.points.map((p) => p.at);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  // Gusts are usually above the sustained wind but not invariably: the two come from
  // different post-processing in the model, and the captured response contains a 6.0 kn
  // gust against a 6.09 kn sustained wind. Left as reported rather than clamped — the
  // discrepancy is smaller than any decision it feeds, and massaging source data to fit
  // an assumption is how quietly wrong numbers get in.
  it('reports plausible gusts, mostly at or above the sustained wind', () => {
    const atLeastSustained = forecast.points.filter((p) => p.gustKn >= p.speedKn).length;
    expect(atLeastSustained / forecast.points.length).toBeGreaterThan(0.9);
    expect(forecast.points.every((p) => p.gustKn > 0 && Number.isFinite(p.gustKn))).toBe(true);
  });
});

describe('looking up wind at a moment', () => {
  const forecast = parseWindResponse(fixture(), PLUM_GUT, Date.UTC(2026, 7, 10));

  it('finds the nearest hour', () => {
    const point = windAt(forecast, Date.UTC(2026, 7, 10, 6, 20));
    expect(point).not.toBeNull();
    expect(point!.at).toBe(Date.UTC(2026, 7, 10, 6, 0));
  });

  it('returns nothing beyond the forecast horizon rather than extrapolating', () => {
    expect(windAt(forecast, Date.UTC(2026, 8, 1))).toBeNull();
  });

  it('returns nothing before the forecast begins', () => {
    expect(windAt(forecast, Date.UTC(2026, 7, 1))).toBeNull();
  });
});

describe('lead time drives confidence', () => {
  const forecast = parseWindResponse(fixture(), PLUM_GUT, Date.UTC(2026, 7, 10));

  it('is zero at the start of the forecast', () => {
    expect(leadDays(forecast, forecast.issuedAt)).toBe(0);
  });

  it('grows a day at a time', () => {
    expect(leadDays(forecast, forecast.issuedAt + 2 * 86_400_000)).toBeCloseTo(2, 5);
  });
});

describe('error handling', () => {
  it('turns an Open-Meteo error body into a non-retryable error', () => {
    expect(() =>
      parseWindResponse({ error: true, reason: 'Latitude must be in range' }, PLUM_GUT, 0)
    ).toThrow(WindForecastError);
    expect(() =>
      parseWindResponse({ error: true, reason: 'Latitude must be in range' }, PLUM_GUT, 0)
    ).toThrow(/Latitude must be in range/);
  });

  it('handles an empty forecast without throwing', () => {
    const forecast = parseWindResponse({ hourly: { time: [] } }, PLUM_GUT, 0);
    expect(forecast.points).toEqual([]);
    expect(windAt(forecast, Date.now())).toBeNull();
  });

  it('skips points with missing values rather than emitting NaN', () => {
    const forecast = parseWindResponse(
      {
        hourly: {
          time: ['2026-08-10T00:00', '2026-08-10T01:00'],
          wind_speed_10m: [10, Number.NaN],
          wind_direction_10m: [200, 210],
          wind_gusts_10m: [15, 16],
        },
      },
      PLUM_GUT,
      0
    );
    expect(forecast.points).toHaveLength(1);
    expect(forecast.points.every((p) => Number.isFinite(p.speedKn))).toBe(true);
  });
});
