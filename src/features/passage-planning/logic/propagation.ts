import type { Position } from '../../../types/navigation';
import { distanceNM, bearingTrue } from '../../../utils/navigation-math';
import { alongTrackCurrentKn, subdivideLeg, interpolateGreatCircle } from '../../../utils/route-geometry';
import type { Utc } from '../../../utils/time';

/**
 * Walking a route forward in time with current applied.
 *
 * The existing leg model assumes a constant speed and ignores current, which is wrong in
 * exactly the places where being wrong costs the most. This replaces it for planning
 * purposes without touching the saved Route, so the leg table and GPX export are
 * unaffected.
 */

/** Current at a place and time, resolved from cache by the caller. */
export interface CurrentSample {
  /** Signed along the station's major axis: positive flood. */
  signedKn: number;
  /** Direction the water is setting toward, degrees true. */
  directionDeg: number;
  kind: 'flood' | 'ebb' | 'slack';
}

/** Looks up the current at a position and instant. Returns null when nothing is cached. */
export type CurrentLookup = (position: Position, at: Utc) => CurrentSample | null;

export interface StepResult {
  from: Position;
  to: Position;
  distanceNm: number;
  courseDeg: number;
  departedAt: Utc;
  arrivedAt: Utc;
  /** Speed made good over the ground, including current. */
  speedOverGroundKn: number;
  /** Along-track current component: positive helped, negative hindered. */
  currentAlongKn: number;
  /** Cumulative distance from the route start at the end of this step. */
  routeDistanceNm: number;
}

export interface PassageProjection {
  departAt: Utc;
  arriveAt: Utc;
  totalDistanceNm: number;
  /** Hours actually elapsed, which is not distance/cruise speed once current is applied. */
  elapsedHours: number;
  steps: StepResult[];
  /** True when at least one step ran with no current data available. */
  hadMissingCurrentData: boolean;
}

/**
 * The slowest speed over ground we will admit.
 *
 * A 6 kn boat meeting 6 kn of foul current makes no ground at all, and the arithmetic
 * would divide by zero or run backwards. Clamping keeps the projection finite; the gate
 * evaluator is what turns "barely moving" into a verdict, which is the honest division of
 * labour — propagation reports, evaluation judges.
 */
const MIN_SOG_KN = 0.5;

/** Legs are walked in steps of at most this length, so current is sampled along the way. */
const STEP_NM = 2;

/**
 * Projects a passage from a departure time.
 *
 * Current is sampled per step rather than per leg because the real Block Island route has
 * a 51.6 NM leg — over eight hours, long enough for the tide to turn completely inside it.
 */
export function projectPassage(
  path: Position[],
  departAt: Utc,
  cruiseSpeedKn: number,
  lookupCurrent: CurrentLookup
): PassageProjection {
  const steps: StepResult[] = [];
  let clock = departAt;
  let routeDistance = 0;
  let missingData = false;

  for (let leg = 0; leg < path.length - 1; leg++) {
    const points = subdivideLeg(path[leg], path[leg + 1], STEP_NM);

    for (let i = 0; i < points.length - 1; i++) {
      const from = points[i];
      const to = points[i + 1];
      const stepNm = distanceNM(from, to);
      if (stepNm < 1e-9) continue;

      const courseDeg = bearingTrue(from, to);
      const sample = lookupCurrent(from, clock);
      if (!sample) missingData = true;

      const currentAlong = sample
        ? alongTrackCurrentKn(Math.abs(sample.signedKn), sample.directionDeg, courseDeg)
        : 0;

      const sog = Math.max(MIN_SOG_KN, cruiseSpeedKn + currentAlong);
      const hours = stepNm / sog;
      const arrivedAt = clock + Math.round(hours * 3_600_000);

      routeDistance += stepNm;
      steps.push({
        from,
        to,
        distanceNm: stepNm,
        courseDeg,
        departedAt: clock,
        arrivedAt,
        speedOverGroundKn: sog,
        currentAlongKn: currentAlong,
        routeDistanceNm: routeDistance,
      });

      clock = arrivedAt;
    }
  }

  return {
    departAt,
    arriveAt: clock,
    totalDistanceNm: routeDistance,
    elapsedHours: (clock - departAt) / 3_600_000,
    steps,
    hadMissingCurrentData: missingData,
  };
}

/**
 * Re-runs the projection so later arrivals reflect earlier ones.
 *
 * Spec §5 asks for an iteration or two: a changed gate speed changes the arrival time at
 * the *next* gate, which changes the current found there. Because each step already
 * samples current at its own arrival time, one pass is self-consistent within rounding —
 * a second pass is run and the result compared, so any drift is visible rather than
 * assumed away.
 */
export function projectPassageIterated(
  path: Position[],
  departAt: Utc,
  cruiseSpeedKn: number,
  lookupCurrent: CurrentLookup,
  iterations = 2
): { projection: PassageProjection; driftMinutes: number } {
  let projection = projectPassage(path, departAt, cruiseSpeedKn, lookupCurrent);
  let drift = 0;

  for (let i = 1; i < iterations; i++) {
    const previousArrival = projection.arriveAt;
    projection = projectPassage(path, departAt, cruiseSpeedKn, lookupCurrent);
    drift = Math.abs(projection.arriveAt - previousArrival) / 60_000;
  }

  return { projection, driftMinutes: drift };
}

/**
 * Where the boat is at a given instant, interpolated within the step it is on.
 *
 * The counterpart to arrivalAtDistance: that answers "when do we reach here", this
 * answers "where are we now". Both read from the same current-aware projection, so a
 * caller cannot accidentally mix a current-aware time with a current-free position.
 */
export function positionAtTime(
  projection: PassageProjection,
  at: Utc
): { position: Position; courseDeg: number; routeDistanceNm: number } | null {
  const steps = projection.steps;
  if (steps.length === 0) return null;

  if (at <= projection.departAt) {
    return { position: steps[0].from, courseDeg: steps[0].courseDeg, routeDistanceNm: 0 };
  }
  const last = steps[steps.length - 1];
  if (at >= last.arrivedAt) {
    return {
      position: last.to,
      courseDeg: last.courseDeg,
      routeDistanceNm: last.routeDistanceNm,
    };
  }

  for (const step of steps) {
    if (at <= step.arrivedAt) {
      const span = step.arrivedAt - step.departedAt;
      const fraction = span > 0 ? (at - step.departedAt) / span : 0;
      return {
        position: interpolateGreatCircle(step.from, step.to, Math.max(0, Math.min(1, fraction))),
        courseDeg: step.courseDeg,
        routeDistanceNm: step.routeDistanceNm - step.distanceNm * (1 - fraction),
      };
    }
  }
  return { position: last.to, courseDeg: last.courseDeg, routeDistanceNm: last.routeDistanceNm };
}

/** Where the boat is, and when, at a given distance along the route. */
export function arrivalAtDistance(
  projection: PassageProjection,
  routeDistanceNm: number
): { at: Utc; courseDeg: number; position: Position } | null {
  if (projection.steps.length === 0) return null;

  for (const step of projection.steps) {
    if (step.routeDistanceNm >= routeDistanceNm) {
      return { at: step.arrivedAt, courseDeg: step.courseDeg, position: step.to };
    }
  }
  const last = projection.steps[projection.steps.length - 1];
  return { at: last.arrivedAt, courseDeg: last.courseDeg, position: last.to };
}
