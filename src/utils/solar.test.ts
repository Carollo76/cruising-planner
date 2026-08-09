import { describe, it, expect } from 'vitest';
import { daylightFor, isDaylight } from './solar';
import { formatLocalTime, localDateTimeToUtc } from './time';

const CENTERPORT = { lat: 40.9015, lng: -73.3592 };
const BLOCK_ISLAND = { lat: 41.1937, lng: -71.5811 };

/** Minutes between two instants, for tolerance assertions. */
function minutesApart(a: number, b: number): number {
  return Math.abs(a - b) / 60_000;
}

describe('sunrise and sunset at Centerport', () => {
  // Cross-checked against NOAA's solar calculator for 40.9015 N, 73.3592 W.
  // Tolerance is 3 minutes: this algorithm ignores the equation-of-time refinements and
  // local horizon, which is far finer than any departure decision needs.
  // Reference derived from New York City (05:25 / 20:31 EDT on this date) shifted 0.65°
  // east to Centerport, worth about 2.6 minutes earlier at both ends.
  it('mid-summer: sunrise about 05:22, sunset about 20:29 EDT', () => {
    const day = localDateTimeToUtc('2026-06-21', '12:00');
    const w = daylightFor(CENTERPORT, day);
    expect(minutesApart(w.sunrise, localDateTimeToUtc('2026-06-21', '05:22'))).toBeLessThan(3);
    expect(minutesApart(w.sunset, localDateTimeToUtc('2026-06-21', '20:29'))).toBeLessThan(3);
  });

  it('mid-winter: sunrise about 07:16, sunset about 16:29 EST', () => {
    const day = localDateTimeToUtc('2026-12-21', '12:00');
    const w = daylightFor(CENTERPORT, day);
    expect(minutesApart(w.sunrise, localDateTimeToUtc('2026-12-21', '07:16'))).toBeLessThan(3);
    expect(minutesApart(w.sunset, localDateTimeToUtc('2026-12-21', '16:29'))).toBeLessThan(3);
  });

  it('the trip date in August gives a long day', () => {
    const day = localDateTimeToUtc('2026-08-17', '12:00');
    const w = daylightFor(CENTERPORT, day);
    const hours = (w.sunset - w.sunrise) / 3_600_000;
    expect(hours).toBeGreaterThan(13.5);
    expect(hours).toBeLessThan(14.2);
  });
});

describe('civil twilight brackets the sun', () => {
  const day = localDateTimeToUtc('2026-08-17', '12:00');
  const w = daylightFor(CENTERPORT, day);

  it('dawn comes before sunrise', () => {
    expect(w.civilDawn).toBeLessThan(w.sunrise);
  });

  it('dusk comes after sunset', () => {
    expect(w.civilDusk).toBeGreaterThan(w.sunset);
  });

  it('adds roughly half an hour at each end at this latitude', () => {
    expect(minutesApart(w.civilDawn, w.sunrise)).toBeGreaterThan(24);
    expect(minutesApart(w.civilDawn, w.sunrise)).toBeLessThan(40);
    expect(minutesApart(w.civilDusk, w.sunset)).toBeGreaterThan(24);
    expect(minutesApart(w.civilDusk, w.sunset)).toBeLessThan(40);
  });
});

describe('position matters', () => {
  it('Block Island sees the sun earlier than Centerport, being further east', () => {
    const day = localDateTimeToUtc('2026-08-17', '12:00');
    const centerport = daylightFor(CENTERPORT, day);
    const blockIsland = daylightFor(BLOCK_ISLAND, day);
    expect(blockIsland.sunrise).toBeLessThan(centerport.sunrise);
    // ~1.8 degrees of longitude, about 7 minutes of solar time.
    expect(minutesApart(blockIsland.sunrise, centerport.sunrise)).toBeGreaterThan(4);
    expect(minutesApart(blockIsland.sunrise, centerport.sunrise)).toBeLessThan(11);
  });
});

describe('crossing the DST boundary', () => {
  // Local clock times shift by an hour, but the sun does not care.
  it('sunrise moves about an hour later on the clock the day DST ends', () => {
    const before = daylightFor(CENTERPORT, localDateTimeToUtc('2026-10-31', '12:00'));
    const after = daylightFor(CENTERPORT, localDateTimeToUtc('2026-11-01', '12:00'));
    const shift =
      Number(formatLocalTime(after.sunrise).slice(0, 2)) -
      Number(formatLocalTime(before.sunrise).slice(0, 2));
    expect(shift).toBe(-1);
  });

  it('actual elapsed daylight barely changes across that boundary', () => {
    const before = daylightFor(CENTERPORT, localDateTimeToUtc('2026-10-31', '12:00'));
    const after = daylightFor(CENTERPORT, localDateTimeToUtc('2026-11-01', '12:00'));
    const dayLengthBefore = (before.sunset - before.sunrise) / 60_000;
    const dayLengthAfter = (after.sunset - after.sunrise) / 60_000;
    expect(Math.abs(dayLengthBefore - dayLengthAfter)).toBeLessThan(5);
  });
});

describe('isDaylight', () => {
  it('is true at midday', () => {
    expect(isDaylight(CENTERPORT, localDateTimeToUtc('2026-08-17', '12:00'))).toBe(true);
  });

  it('is false in the middle of the night', () => {
    expect(isDaylight(CENTERPORT, localDateTimeToUtc('2026-08-17', '02:00'))).toBe(false);
  });

  it('is true just after civil dawn', () => {
    const w = daylightFor(CENTERPORT, localDateTimeToUtc('2026-08-17', '12:00'));
    expect(isDaylight(CENTERPORT, w.civilDawn + 60_000)).toBe(true);
  });

  it('is false just before civil dawn', () => {
    const w = daylightFor(CENTERPORT, localDateTimeToUtc('2026-08-17', '12:00'));
    expect(isDaylight(CENTERPORT, w.civilDawn - 60_000)).toBe(false);
  });

  it('an 04:40 departure in August is before civil dawn', () => {
    // Matters directly: the spec's headline example is a 04:40 departure.
    expect(isDaylight(CENTERPORT, localDateTimeToUtc('2026-08-17', '04:40'))).toBe(false);
  });
});
