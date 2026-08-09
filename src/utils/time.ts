/**
 * Time handling for passage planning.
 *
 * Rule for the whole feature: every instant is stored and computed as a UTC epoch
 * millisecond. Local wall-clock only appears at the edges — parsing NOAA responses and
 * rendering to the user. Departure solving crosses midnight, and Long Island Sound
 * observes DST, so "add 6 hours" and "6 hours later on the clock" are not the same thing
 * twice a year. Mixing the two is how a 04:40 departure silently becomes 03:40.
 */

/** IANA zone for the boat's cruising ground. */
export const BOAT_TIME_ZONE = 'America/New_York';

/** A UTC instant, in epoch milliseconds. */
export type Utc = number;

/**
 * Parses NOAA's `YYYY-MM-DD HH:mm` GMT timestamps.
 *
 * We request `time_zone=gmt` precisely so this is unambiguous: NOAA's `lst_ldt` option
 * returns bare local wall-clock with no offset, and during the autumn fall-back hour the
 * same string occurs twice with no way to tell which instant is meant.
 */
export function parseNoaaGmt(stamp: string): Utc {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(stamp.trim());
  if (!m) throw new Error(`unrecognised NOAA timestamp: ${stamp}`);
  const [, y, mo, d, h, mi] = m;
  return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
}

/** Formats a UTC instant in the boat's local zone, e.g. "04:40". */
export function formatLocalTime(utc: Utc, zone: string = BOAT_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(utc));
}

/** Formats a UTC instant as a local date + time, e.g. "Aug 17, 04:40". */
export function formatLocalDateTime(utc: Utc, zone: string = BOAT_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(utc));
}

/** The local calendar date of an instant, as `YYYY-MM-DD` in the boat's zone. */
export function localDateKey(utc: Utc, zone: string = BOAT_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(utc));
  return parts; // en-CA yields YYYY-MM-DD
}

/** The zone's UTC offset in minutes at a given instant (negative west of Greenwich). */
export function utcOffsetMinutes(utc: Utc, zone: string = BOAT_TIME_ZONE): number {
  // Compare the same instant rendered as if it were UTC against the target zone.
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(new Date(utc)).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value])
  ) as Record<string, string>;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === '24' ? '00' : parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return Math.round((asUtc - utc) / 60_000);
}

/**
 * Resolves a local date and time-of-day in a zone to a UTC instant.
 *
 * Departure windows are expressed as local wall-clock ("earliest 06:00"), so this is the
 * conversion the solver depends on. Two passes settle the offset, which matters on DST
 * days where the naive offset belongs to the wrong side of the transition.
 */
export function localDateTimeToUtc(
  dateKey: string,
  timeOfDay: string,
  zone: string = BOAT_TIME_ZONE
): Utc {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  const tm = /^(\d{1,2}):(\d{2})$/.exec(timeOfDay);
  if (!dm) throw new Error(`bad date key: ${dateKey}`);
  if (!tm) throw new Error(`bad time of day: ${timeOfDay}`);

  const naive = Date.UTC(
    Number(dm[1]),
    Number(dm[2]) - 1,
    Number(dm[3]),
    Number(tm[1]),
    Number(tm[2])
  );

  let guess = naive - utcOffsetMinutes(naive, zone) * 60_000;
  guess = naive - utcOffsetMinutes(guess, zone) * 60_000;
  return guess;
}

/** Adds real elapsed hours. Deliberately duration arithmetic, not calendar arithmetic. */
export function addHours(utc: Utc, hours: number): Utc {
  return utc + Math.round(hours * 3_600_000);
}

export function addMinutes(utc: Utc, minutes: number): Utc {
  return utc + minutes * 60_000;
}

/** True when the two instants fall on the same local calendar day. */
export function isSameLocalDay(a: Utc, b: Utc, zone: string = BOAT_TIME_ZONE): boolean {
  return localDateKey(a, zone) === localDateKey(b, zone);
}
