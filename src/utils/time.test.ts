import { describe, it, expect } from 'vitest';
import {
  parseNoaaGmt,
  formatLocalTime,
  localDateKey,
  utcOffsetMinutes,
  localDateTimeToUtc,
  addHours,
  isSameLocalDay,
} from './time';

describe('parseNoaaGmt', () => {
  it('reads a NOAA GMT stamp as UTC, not local', () => {
    expect(parseNoaaGmt('2026-08-17 00:25')).toBe(Date.UTC(2026, 7, 17, 0, 25));
  });

  it('accepts the ISO-ish T separator too', () => {
    expect(parseNoaaGmt('2026-08-17T06:38')).toBe(Date.UTC(2026, 7, 17, 6, 38));
  });

  it('rejects anything it does not recognise rather than guessing', () => {
    expect(() => parseNoaaGmt('17/08/2026 06:38')).toThrow(/unrecognised/);
  });
});

describe('offsets across DST', () => {
  it('is EDT (-240) in summer', () => {
    expect(utcOffsetMinutes(Date.UTC(2026, 7, 17, 12, 0))).toBe(-240);
  });

  it('is EST (-300) in winter', () => {
    expect(utcOffsetMinutes(Date.UTC(2026, 0, 17, 12, 0))).toBe(-300);
  });
});

describe('localDateTimeToUtc', () => {
  it('resolves a summer local time to the right instant', () => {
    // 04:40 EDT on 17 Aug 2026 == 08:40 UTC
    expect(localDateTimeToUtc('2026-08-17', '04:40')).toBe(Date.UTC(2026, 7, 17, 8, 40));
  });

  it('resolves a winter local time to the right instant', () => {
    // 04:40 EST on 17 Jan 2026 == 09:40 UTC
    expect(localDateTimeToUtc('2026-01-17', '04:40')).toBe(Date.UTC(2026, 0, 17, 9, 40));
  });

  it('round-trips through formatLocalTime', () => {
    const utc = localDateTimeToUtc('2026-08-17', '04:40');
    expect(formatLocalTime(utc)).toBe('04:40');
  });
});

// The spec calls out DST explicitly: "write tests that cross a DST boundary".
// US DST 2026: forward 08 Mar, back 01 Nov.
describe('crossing a DST boundary', () => {
  it('spring forward: 8 elapsed hours from 23:00 lands at 08:00, not 07:00', () => {
    // 07 Mar 2026 23:00 EST -> +8h real time. The clock jumps 02:00 -> 03:00 overnight,
    // so the wall clock advances 9 hours while only 8 hours elapse.
    const depart = localDateTimeToUtc('2026-03-07', '23:00');
    const arrive = addHours(depart, 8);
    expect(formatLocalTime(arrive)).toBe('08:00');
  });

  it('fall back: 8 elapsed hours from 23:00 lands at 06:00, not 07:00', () => {
    // 31 Oct 2026 23:00 EDT -> +8h. The clock repeats 01:00-02:00, so the wall clock
    // advances only 7 hours across 8 real hours.
    const depart = localDateTimeToUtc('2026-10-31', '23:00');
    const arrive = addHours(depart, 8);
    expect(formatLocalTime(arrive)).toBe('06:00');
  });

  it('a passage starting the evening before spring-forward reports the correct local date', () => {
    const depart = localDateTimeToUtc('2026-03-07', '23:00');
    expect(localDateKey(depart)).toBe('2026-03-07');
    expect(localDateKey(addHours(depart, 8))).toBe('2026-03-08');
    expect(isSameLocalDay(depart, addHours(depart, 8))).toBe(false);
  });

  it('the 02:00-02:59 gap on spring-forward resolves to a real instant', () => {
    // 02:30 does not exist locally on 08 Mar 2026. It must not throw or produce NaN;
    // it should land on a genuine instant near the transition.
    const utc = localDateTimeToUtc('2026-03-08', '02:30');
    expect(Number.isFinite(utc)).toBe(true);
    expect(localDateKey(utc)).toBe('2026-03-08');
  });
});

describe('addHours is duration arithmetic', () => {
  it('adds real elapsed time regardless of the calendar', () => {
    const t = Date.UTC(2026, 7, 17, 0, 0);
    expect(addHours(t, 6.5) - t).toBe(6.5 * 3_600_000);
  });
});
