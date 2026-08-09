import type { Position } from '../types/navigation';
import type { Utc } from './time';

/**
 * Sunrise, sunset and civil twilight, computed locally.
 *
 * The spec is explicit that daylight limits must not add a network dependency — the boat
 * needs them at anchor with no signal, and they are pure astronomy. This is the NOAA
 * solar position algorithm, accurate to well under a minute for these latitudes, which is
 * far finer than any departure decision.
 */

const DEG = Math.PI / 180;

/** Sun altitude at the moment of the event, in degrees. */
const SUNRISE_ALTITUDE = -0.833; // includes refraction and the sun's radius
const CIVIL_ALTITUDE = -6;

export interface DaylightWindow {
  sunrise: Utc;
  sunset: Utc;
  civilDawn: Utc;
  civilDusk: Utc;
  /** True when the sun never reaches the required altitude — polar day or night. */
  degenerate: boolean;
}

/** Julian day number for an instant. */
function toJulian(utc: Utc): number {
  return utc / 86_400_000 + 2440587.5;
}

function fromJulian(julian: number): Utc {
  return Math.round((julian - 2440587.5) * 86_400_000);
}

/**
 * Hour angle at which the sun reaches a given altitude, in days.
 * Returns null when the sun never gets there on that date.
 */
function hourAngle(altitudeDeg: number, latDeg: number, declinationRad: number): number | null {
  const cosH =
    (Math.sin(altitudeDeg * DEG) - Math.sin(latDeg * DEG) * Math.sin(declinationRad)) /
    (Math.cos(latDeg * DEG) * Math.cos(declinationRad));
  if (cosH > 1 || cosH < -1) return null;
  return Math.acos(cosH) / (2 * Math.PI);
}

/**
 * Daylight window for a position on the local day containing `dayUtc`.
 *
 * Longitude drives the solar day, so results are anchored to solar noon at that meridian
 * rather than to any civil timezone.
 */
export function daylightFor(position: Position, dayUtc: Utc): DaylightWindow {
  // West longitude, positive. Solar noon at 73 W falls ~4.9 h *after* 12:00 UT, so the
  // term adds when locating the transit and subtracts when picking the day number.
  const westLng = -position.lng;

  const n = Math.round(toJulian(dayUtc) - 2451545.0 + 0.0008 - westLng / 360);
  const meanSolarNoon = n + 0.0009 + westLng / 360;
  const meanAnomaly = (357.5291 + 0.98560028 * meanSolarNoon) % 360;
  const center =
    1.9148 * Math.sin(meanAnomaly * DEG) +
    0.02 * Math.sin(2 * meanAnomaly * DEG) +
    0.0003 * Math.sin(3 * meanAnomaly * DEG);
  const eclipticLongitude = (meanAnomaly + center + 180 + 102.9372) % 360;

  const solarTransit =
    2451545.0 +
    meanSolarNoon +
    0.0053 * Math.sin(meanAnomaly * DEG) -
    0.0069 * Math.sin(2 * eclipticLongitude * DEG);

  const declination = Math.asin(Math.sin(eclipticLongitude * DEG) * Math.sin(23.4397 * DEG));

  const wSunrise = hourAngle(SUNRISE_ALTITUDE, position.lat, declination);
  const wCivil = hourAngle(CIVIL_ALTITUDE, position.lat, declination);

  // Degenerate cases only arise far north or south of anywhere this boat sails, but
  // returning something coherent beats returning NaN.
  if (wSunrise === null || wCivil === null) {
    const noon = fromJulian(solarTransit);
    return {
      sunrise: noon,
      sunset: noon,
      civilDawn: noon,
      civilDusk: noon,
      degenerate: true,
    };
  }

  return {
    sunrise: fromJulian(solarTransit - wSunrise),
    sunset: fromJulian(solarTransit + wSunrise),
    civilDawn: fromJulian(solarTransit - wCivil),
    civilDusk: fromJulian(solarTransit + wCivil),
    degenerate: false,
  };
}

/** True when the instant falls between civil dawn and civil dusk at that position. */
export function isDaylight(position: Position, at: Utc): boolean {
  const window = daylightFor(position, at);
  if (window.degenerate) return true;
  return at >= window.civilDawn && at <= window.civilDusk;
}
