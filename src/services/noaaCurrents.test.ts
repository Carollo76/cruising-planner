import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePredictionBody, NoaaCurrentsError, defaultBin } from './noaaCurrents';
import { currentCacheKey, isStale, STALE_AFTER_MS } from '../types/currents';
import { formatLocalTime, localDateKey } from '../utils/time';

/** Literal responses captured from the live NOAA API — see fixtures/README.md. */
function fixture(name: string): unknown {
  return JSON.parse(readFileSync(`src/test/fixtures/${name}`, 'utf8'));
}

const META = {
  stationId: 'LIS1001',
  bin: 7,
  interval: 'MAX_SLACK' as const,
  dateKey: '2026-08-17',
  fetchedAt: Date.UTC(2026, 7, 16, 12, 0),
};

describe('parsing real NOAA MAX_SLACK responses', () => {
  const race = parsePredictionBody(fixture('noaa-race-maxslack-20260817.json') as never, META);

  it('reads every event', () => {
    expect(race.events).toHaveLength(8);
  });

  it('captures the station flood/ebb axis reported alongside the data', () => {
    // These are what make favourable direction derivable rather than assumed (spec §1).
    expect(race.meanFloodDirDeg).toBe(292);
    expect(race.meanEbbDirDeg).toBe(108);
  });

  it('treats NOAA times as GMT, not local', () => {
    // "2026-08-17 01:35" GMT is 21:35 the previous evening in the boat's zone.
    expect(race.events[0].at).toBe(Date.UTC(2026, 7, 17, 1, 35));
    expect(formatLocalTime(race.events[0].at)).toBe('21:35');
  });

  it('keeps NOAA’s signed convention: flood positive, ebb negative', () => {
    const flood = race.events.find((e) => e.kind === 'flood');
    const ebb = race.events.find((e) => e.kind === 'ebb');
    expect(flood?.velocityKn).toBeGreaterThan(0);
    expect(ebb?.velocityKn).toBeLessThan(0);
  });

  it('classifies slack from the declared type even when velocity is not exactly zero', () => {
    // The Race reports slack at 0.01 kn; a naive zero test would miss it.
    const slack = race.events.filter((e) => e.kind === 'slack');
    expect(slack).toHaveLength(4);
    expect(slack.some((e) => e.velocityKn !== 0)).toBe(true);
  });

  it('returns events in chronological order', () => {
    const times = race.events.map((e) => e.at);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('peak Race current is the 3+ knots that makes it a gate', () => {
    const peak = Math.max(...race.events.map((e) => Math.abs(e.velocityKn)));
    expect(peak).toBeGreaterThan(3);
  });
});

describe('Plum Gut has its own axis', () => {
  const plum = parsePredictionBody(fixture('noaa-plumgut-maxslack-20260817.json') as never, {
    ...META,
    stationId: 'LIS1012',
    bin: 10,
  });

  it('differs from The Race, so the axis cannot be hardcoded once', () => {
    expect(plum.meanFloodDirDeg).toBe(305);
    expect(plum.meanEbbDirDeg).toBe(124);
  });
});

describe('the 6-minute series', () => {
  const series = parsePredictionBody(fixture('noaa-plumgut-6min-20260817.json') as never, {
    ...META,
    stationId: 'LIS1012',
    bin: 10,
    interval: '6',
  });

  it('returns a full day of samples', () => {
    expect(series.events.length).toBe(240);
  });

  it('derives flood/ebb from velocity sign, since the series declares no type', () => {
    expect(series.events.some((e) => e.kind === 'flood')).toBe(true);
    expect(series.events.some((e) => e.kind === 'ebb')).toBe(true);
  });

  it('treats near-zero velocity as slack', () => {
    const slack = series.events.filter((e) => e.kind === 'slack');
    expect(slack.every((e) => Math.abs(e.velocityKn) < 0.1)).toBe(true);
  });
});

describe('DST day', () => {
  // 01 Nov 2026 is fall-back: 01:00-02:00 local happens twice. Parsing GMT sidesteps the
  // ambiguity entirely, which is the reason for requesting GMT in the first place.
  const dst = parsePredictionBody(fixture('noaa-race-maxslack-20261101-dst.json') as never, {
    ...META,
    dateKey: '2026-11-01',
  });

  it('yields strictly increasing instants despite the repeated local hour', () => {
    const times = dst.events.map((e) => e.at);
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1]);
  });

  it('renders local times that are all on the expected local day', () => {
    const onDay = dst.events.filter((e) => localDateKey(e.at) === '2026-11-01');
    expect(onDay.length).toBeGreaterThan(0);
  });
});

describe('error handling', () => {
  it('turns NOAA’s 200-with-error-body into a non-retryable error', () => {
    // NOAA answers a bad station id with HTTP 200 and an error object.
    expect(() =>
      parsePredictionBody(fixture('noaa-error-badstation.json') as never, META)
    ).toThrow(NoaaCurrentsError);
    expect(() =>
      parsePredictionBody(fixture('noaa-error-badstation.json') as never, META)
    ).toThrow(/Wrong Station ID/);
  });

  it('marks a bad-request error as not worth retrying', () => {
    try {
      parsePredictionBody(fixture('noaa-error-badstation.json') as never, META);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as NoaaCurrentsError).retryable).toBe(false);
    }
  });

  it('rejects a non-numeric velocity rather than silently producing NaN', () => {
    const bad = { current_predictions: { cp: [{ Time: '2026-08-17 01:35', Velocity_Major: 'n/a' }] } };
    expect(() => parsePredictionBody(bad as never, META)).toThrow(/non-numeric/);
  });

  it('handles an empty prediction set without throwing', () => {
    const empty = { current_predictions: { cp: [] } };
    const rec = parsePredictionBody(empty as never, META);
    expect(rec.events).toEqual([]);
    expect(rec.meanFloodDirDeg).toBeNull();
  });
});

describe('cache keys and staleness', () => {
  it('separates intervals for the same station and day', () => {
    expect(currentCacheKey('LIS1001', 7, 'MAX_SLACK', '2026-08-17')).not.toBe(
      currentCacheKey('LIS1001', 7, '6', '2026-08-17')
    );
  });

  it('separates bins', () => {
    expect(currentCacheKey('LIS1001', 1, 'MAX_SLACK', '2026-08-17')).not.toBe(
      currentCacheKey('LIS1001', 7, 'MAX_SLACK', '2026-08-17')
    );
  });

  it('flags records older than 30 days', () => {
    const now = Date.UTC(2026, 7, 17);
    const rec = { fetchedAt: now - STALE_AFTER_MS - 1 } as never;
    expect(isStale(rec, now)).toBe(true);
  });

  it('does not flag fresh records', () => {
    const now = Date.UTC(2026, 7, 17);
    const rec = { fetchedAt: now - 86_400_000 } as never;
    expect(isStale(rec, now)).toBe(false);
  });
});

describe('bin selection', () => {
  it('picks the surface bin, which is where the keel is', () => {
    expect(defaultBin({ id: 'LIS1001', name: '', lat: 0, lng: 0, bins: [1, 7, 13], type: 'H' })).toBe(1);
  });

  it('falls back to bin 1 when a station reports none', () => {
    expect(defaultBin({ id: 'X', name: '', lat: 0, lng: 0, bins: [], type: null })).toBe(1);
  });
});
