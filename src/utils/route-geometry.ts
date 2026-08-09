import type { Position } from '../types/navigation';
import { distanceNM, bearingTrue, toRad, toDeg } from './navigation-math';

/**
 * Geometry for deciding whether a route passes through a place.
 *
 * The existing station matcher measures from waypoints only. On the real Block Island
 * route that puts The Race 7.2 NM away — outside any sane radius — when the track
 * actually passes 3.35 NM from it, because the leg spanning Plum Gut to Block Island is
 * 27 NM long with no waypoint near the station. Distance has to be measured to the
 * *path*, not to its endpoints.
 */

/** Mean earth radius in nautical miles. */
const EARTH_NM = 3440.065;

export interface ClosestApproach {
  /** Distance from the point to the nearest place on the segment, in NM. */
  distanceNm: number;
  /** Where along the segment that happens: 0 at the start, 1 at the end. */
  alongFraction: number;
  /** The position of closest approach. */
  at: Position;
  /** Course over ground of the segment at that point, degrees true. */
  cogDeg: number;
  /** Distance from the segment start to the closest point, in NM. */
  alongDistanceNm: number;
}

/**
 * Closest approach of a point to a great-circle segment.
 *
 * Uses the standard cross-track/along-track formulation, then clamps to the segment ends
 * so a station that lies *beyond* a leg is measured to the nearer endpoint rather than to
 * an imaginary extension of the track.
 */
export function closestApproachToSegment(
  point: Position,
  from: Position,
  to: Position
): ClosestApproach {
  const segLength = distanceNM(from, to);

  // Degenerate segment: treat as a point.
  if (segLength < 1e-6) {
    return {
      distanceNm: distanceNM(point, from),
      alongFraction: 0,
      at: from,
      cogDeg: bearingTrue(from, to),
      alongDistanceNm: 0,
    };
  }

  const d13 = distanceNM(from, point) / EARTH_NM; // angular distance
  const theta13 = toRad(bearingTrue(from, point));
  const theta12 = toRad(bearingTrue(from, to));

  const crossTrackAngular = Math.asin(Math.sin(d13) * Math.sin(theta13 - theta12));
  const alongTrackAngular = Math.acos(
    Math.min(1, Math.max(-1, Math.cos(d13) / Math.cos(crossTrackAngular)))
  );
  const alongNm = alongTrackAngular * EARTH_NM;

  // Past either end, the nearest point on the *segment* is that endpoint.
  if (alongNm <= 0 || Math.cos(theta13 - theta12) < 0) {
    return {
      distanceNm: distanceNM(point, from),
      alongFraction: 0,
      at: from,
      cogDeg: bearingTrue(from, to),
      alongDistanceNm: 0,
    };
  }
  if (alongNm >= segLength) {
    return {
      distanceNm: distanceNM(point, to),
      alongFraction: 1,
      at: to,
      cogDeg: bearingTrue(from, to),
      alongDistanceNm: segLength,
    };
  }

  const fraction = alongNm / segLength;
  return {
    distanceNm: Math.abs(crossTrackAngular) * EARTH_NM,
    alongFraction: fraction,
    at: interpolateGreatCircle(from, to, fraction),
    cogDeg: bearingTrue(from, to),
    alongDistanceNm: alongNm,
  };
}

/** Point a given fraction along the great circle between two positions. */
export function interpolateGreatCircle(from: Position, to: Position, fraction: number): Position {
  const d = distanceNM(from, to) / EARTH_NM;
  if (d < 1e-9) return { lat: from.lat, lng: from.lng };

  const a = Math.sin((1 - fraction) * d) / Math.sin(d);
  const b = Math.sin(fraction * d) / Math.sin(d);

  const lat1 = toRad(from.lat);
  const lon1 = toRad(from.lng);
  const lat2 = toRad(to.lat);
  const lon2 = toRad(to.lng);

  const x = a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
  const y = a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
  const z = a * Math.sin(lat1) + b * Math.sin(lat2);

  return {
    lat: toDeg(Math.atan2(z, Math.hypot(x, y))),
    lng: toDeg(Math.atan2(y, x)),
  };
}

export interface RouteApproach extends ClosestApproach {
  /** Index of the leg (0 = between waypoint 0 and 1). */
  legIndex: number;
  /** Distance from the route's start to the closest point, in NM. */
  routeDistanceNm: number;
}

/**
 * Closest approach of a point to a whole route, and how far along the route it happens.
 *
 * The along-route distance is what orders gate transits: the boat meets them in the order
 * it covers ground, not in the order the gates were declared.
 */
export function closestApproachToRoute(point: Position, path: Position[]): RouteApproach | null {
  if (path.length < 2) return null;

  let best: RouteApproach | null = null;
  let travelled = 0;

  for (let i = 0; i < path.length - 1; i++) {
    const legLength = distanceNM(path[i], path[i + 1]);
    const approach = closestApproachToSegment(point, path[i], path[i + 1]);
    if (!best || approach.distanceNm < best.distanceNm) {
      best = {
        ...approach,
        legIndex: i,
        routeDistanceNm: travelled + approach.alongDistanceNm,
      };
    }
    travelled += legLength;
  }
  return best;
}

/** Smallest absolute angle between two compass bearings, 0-180. */
export function angularDifference(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/**
 * Component of a current along the boat's course, in knots.
 *
 * Positive helps, negative hinders. A scalar projection is all the spec asks for and all
 * the data supports — NOAA reports a single major-axis velocity, so pretending to resolve
 * cross-track set would be inventing precision that is not there.
 */
export function alongTrackCurrentKn(
  currentSpeedKn: number,
  currentDirDeg: number,
  courseDeg: number
): number {
  return currentSpeedKn * Math.cos(toRad(currentDirDeg - courseDeg));
}

/**
 * Splits a leg into steps of at most `maxStepNm`.
 *
 * The real Block Island route has a 51.6 NM leg — over eight hours at cruising speed,
 * long enough for the current to reverse completely. Sampling such a leg once would
 * assign a single current to the whole thing and be wrong for most of it.
 */
export function subdivideLeg(from: Position, to: Position, maxStepNm = 2): Position[] {
  const length = distanceNM(from, to);
  const steps = Math.max(1, Math.ceil(length / maxStepNm));
  const points: Position[] = [];
  for (let i = 0; i <= steps; i++) {
    points.push(interpolateGreatCircle(from, to, i / steps));
  }
  return points;
}
