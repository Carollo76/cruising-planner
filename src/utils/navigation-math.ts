import type { Position } from '../types/navigation';

const EARTH_RADIUS_NM = 3440.065;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export function toRad(deg: number): number {
  return deg * DEG_TO_RAD;
}

export function toDeg(rad: number): number {
  return rad * RAD_TO_DEG;
}

/** Haversine distance between two positions in nautical miles */
export function distanceNM(from: Position, to: Position): number {
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_NM * c;
}

/** Initial true bearing from one position to another (degrees 0-360) */
export function bearingTrue(from: Position, to: Position): number {
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLng = toRad(to.lng - from.lng);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  const bearing = toDeg(Math.atan2(y, x));
  return (bearing + 360) % 360;
}

/** Rhumb line distance in nautical miles */
export function rhumbDistanceNM(from: Position, to: Position): number {
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLat = lat2 - lat1;
  const dLng = toRad(to.lng - from.lng);

  const dPhi = Math.log(
    Math.tan(Math.PI / 4 + lat2 / 2) / Math.tan(Math.PI / 4 + lat1 / 2)
  );
  const q = Math.abs(dPhi) > 1e-12 ? dLat / dPhi : Math.cos(lat1);

  const dLngAdjusted = Math.abs(dLng) > Math.PI
    ? (dLng > 0 ? -(2 * Math.PI - dLng) : (2 * Math.PI + dLng))
    : dLng;

  const dist = Math.sqrt(dLat * dLat + q * q * dLngAdjusted * dLngAdjusted) * EARTH_RADIUS_NM;
  return dist;
}

/** Rhumb line bearing in degrees */
export function rhumbBearing(from: Position, to: Position): number {
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLng = toRad(to.lng - from.lng);

  const dPhi = Math.log(
    Math.tan(Math.PI / 4 + lat2 / 2) / Math.tan(Math.PI / 4 + lat1 / 2)
  );

  const dLngAdjusted = Math.abs(dLng) > Math.PI
    ? (dLng > 0 ? -(2 * Math.PI - dLng) : (2 * Math.PI + dLng))
    : dLng;

  const bearing = toDeg(Math.atan2(dLngAdjusted, dPhi));
  return (bearing + 360) % 360;
}

/** Approximate magnetic variation for US East Coast (simplified model).
 *  For production, use the World Magnetic Model (WMM) coefficients.
 *  This simplified version returns approximate values for the US East Coast. */
export function magneticVariation(position: Position): number {
  // Simplified: US East Coast variation ranges from about -10 (Maine) to -7 (Florida)
  // Linear interpolation based on latitude
  const lat = position.lat;
  if (lat >= 25 && lat <= 48) {
    return -7 - (lat - 25) * (5 / 23);
  }
  return -10; // fallback
}

/** Convert true bearing to magnetic */
export function bearingMagnetic(trueBearing: number, position: Position): number {
  const variation = magneticVariation(position);
  return (trueBearing - variation + 360) % 360;
}

/** Estimated time in hours given distance and speed */
export function etaHours(distanceNM: number, speedKnots: number): number {
  if (speedKnots <= 0) return Infinity;
  return distanceNM / speedKnots;
}

/** Fuel consumption in gallons for a given distance */
export function fuelConsumption(distanceNM: number, speedKnots: number, gph: number): number {
  const hours = etaHours(distanceNM, speedKnots);
  return hours * gph;
}

/** Interpolate a position along a great circle path */
export function interpolatePosition(from: Position, to: Position, fraction: number): Position {
  const lat1 = toRad(from.lat);
  const lng1 = toRad(from.lng);
  const lat2 = toRad(to.lat);
  const lng2 = toRad(to.lng);

  const d = distanceNM(from, to) / EARTH_RADIUS_NM;
  if (d < 1e-12) return from;

  const a = Math.sin((1 - fraction) * d) / Math.sin(d);
  const b = Math.sin(fraction * d) / Math.sin(d);

  const x = a * Math.cos(lat1) * Math.cos(lng1) + b * Math.cos(lat2) * Math.cos(lng2);
  const y = a * Math.cos(lat1) * Math.sin(lng1) + b * Math.cos(lat2) * Math.sin(lng2);
  const z = a * Math.sin(lat1) + b * Math.sin(lat2);

  return {
    lat: toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))),
    lng: toDeg(Math.atan2(y, x)),
  };
}

/** Format distance for display */
export function formatDistance(nm: number): string {
  return nm < 0.1 ? `${Math.round(nm * 1852)}m` : `${nm.toFixed(1)} NM`;
}

/** Format bearing for display */
export function formatBearing(degrees: number): string {
  return `${Math.round(degrees).toString().padStart(3, '0')}°`;
}

/** Format time duration */
export function formatDuration(hours: number): string {
  if (!isFinite(hours)) return '--';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
