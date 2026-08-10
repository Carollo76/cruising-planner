import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseTideBody, heightAt, tideCacheKey, TideError } from './noaaTides';
import { formatLocalTime } from '../utils/time';

/** A literal NOAA hourly predictions response, captured from the live API. */
function fixture() {
  return JSON.parse(readFileSync('src/test/fixtures/noaa-tide-hourly-20260817.json', 'utf8'));
}

const META = { stationId: '8514560', dateKey: '2026-08-17', fetchedAt: Date.UTC(2026, 7, 16) };

describe('parsing real NOAA tide predictions', () => {
  const record = parseTideBody(fixture(), META);

  it('reads a full day of hourly heights', () => {
    expect(record.points).toHaveLength(24);
  });

  it('reads the height in feet above MLLW', () => {
    expect(record.points[0].heightFt).toBeCloseTo(0.897, 3);
  });

  it('treats the timestamps as GMT, not local', () => {
    expect(record.points[0].at).toBe(Date.UTC(2026, 7, 17, 0, 0));
    expect(formatLocalTime(record.points[0].at)).toBe('20:00');
  });

  it('returns points in chronological order', () => {
    const times = record.points.map((p) => p.at);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('covers a real tidal range over the day', () => {
    const heights = record.points.map((p) => p.heightFt);
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(1);
  });
});

describe('height at an instant', () => {
  const record = parseTideBody(fixture(), META);

  it('returns the tabulated value on the hour', () => {
    expect(heightAt(record, record.points[3].at)).toBeCloseTo(record.points[3].heightFt, 6);
  });

  it('interpolates between hours', () => {
    const midway = (record.points[3].at + record.points[4].at) / 2;
    const value = heightAt(record, midway)!;
    const lo = Math.min(record.points[3].heightFt, record.points[4].heightFt);
    const hi = Math.max(record.points[3].heightFt, record.points[4].heightFt);
    expect(value).toBeGreaterThanOrEqual(lo);
    expect(value).toBeLessThanOrEqual(hi);
  });

  // Holding the last known height is exactly the error that puts a keel in the mud.
  it('returns nothing outside the record rather than the last known height', () => {
    expect(heightAt(record, record.points[0].at - 3_600_000)).toBeNull();
    expect(heightAt(record, record.points[23].at + 3_600_000)).toBeNull();
  });
});

describe('error handling', () => {
  it('surfaces a NOAA error body as a non-retryable error', () => {
    expect(() => parseTideBody({ error: { message: ' Wrong Station ID ' } }, META)).toThrow(TideError);
    expect(() => parseTideBody({ error: { message: ' Wrong Station ID ' } }, META)).toThrow(
      /Wrong Station ID/
    );
  });

  it('rejects a non-numeric height rather than producing NaN', () => {
    expect(() =>
      parseTideBody({ predictions: [{ t: '2026-08-17 00:00', v: 'n/a' }] }, META)
    ).toThrow(/non-numeric/);
  });

  it('handles an empty prediction set', () => {
    const record = parseTideBody({ predictions: [] }, META);
    expect(record.points).toEqual([]);
    expect(heightAt(record, Date.now())).toBeNull();
  });
});

describe('cache keys', () => {
  it('separates stations and days', () => {
    expect(tideCacheKey('8514560', '2026-08-17')).not.toBe(tideCacheKey('8514560', '2026-08-18'));
    expect(tideCacheKey('8514560', '2026-08-17')).not.toBe(tideCacheKey('8510560', '2026-08-17'));
  });
});
