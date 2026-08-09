import type { Position } from '../../../types/navigation';
import { closestApproachToRoute, angularDifference } from '../../../utils/route-geometry';
import { TIDAL_GATES, type TidalGate } from '../model/gates';

/**
 * Working out which gates a route transits, and which way through.
 *
 * Matching is against the track, not the waypoints: on the real Block Island route the
 * nearest waypoint to The Race is 7.2 NM away while the track passes 3.35 NM from it.
 */

export type TransitSense = 'eastbound' | 'westbound';

export interface GateTransit {
  gate: TidalGate;
  /** How far along the route the transit happens, NM from the start. Orders the list. */
  routeDistanceNm: number;
  /** Closest the track comes to the gate, NM. */
  offsetNm: number;
  /** Boat's course through the gate, degrees true. */
  courseDeg: number;
  position: Position;
  legIndex: number;
  /** Which way along the gate's flood/ebb axis the boat is going. */
  sense: TransitSense;
}

/**
 * Classifies a transit against the station's own flood/ebb axis.
 *
 * "Eastbound" means travelling with the ebb axis, whatever compass direction that is at
 * this particular gate. Deriving it per-gate from NOAA's reported axis is what stops the
 * classification being an assumption baked into the registry.
 */
export function classifySense(courseDeg: number, meanEbbDirDeg: number): TransitSense {
  return angularDifference(courseDeg, meanEbbDirDeg) <= 90 ? 'eastbound' : 'westbound';
}

/**
 * Which current phase helps a boat on this heading.
 *
 * Purely geometric: if the course lies within 90° of the ebb axis, the ebb pushes the
 * boat along. The gate's `expectedFavourable` is only a cross-check.
 */
export function favourablePhase(
  courseDeg: number,
  meanFloodDirDeg: number,
  meanEbbDirDeg: number
): 'flood' | 'ebb' {
  const toEbb = angularDifference(courseDeg, meanEbbDirDeg);
  const toFlood = angularDifference(courseDeg, meanFloodDirDeg);
  return toEbb <= toFlood ? 'ebb' : 'flood';
}

/**
 * Compares derived against configured, per spec §1.
 *
 * Returns a warning string when they disagree so it can be logged and surfaced, rather
 * than silently preferring one. Disagreement means either the registry is wrong or the
 * route is doing something unusual, and both are worth knowing.
 */
export function checkFavourableAgreement(
  gate: TidalGate,
  sense: TransitSense,
  derived: 'flood' | 'ebb'
): string | null {
  const configured = gate.expectedFavourable[sense];
  if (configured === derived) return null;
  return (
    `Gate ${gate.name}: derived favourable phase (${derived}) disagrees with configured ` +
    `${sense} expectation (${configured}). Using the derived value from NOAA's axis.`
  );
}

export interface MatchOptions {
  gates?: TidalGate[];
  /** Extra slack added to each gate's own radius, for exploring near-misses. */
  radiusPaddingNm?: number;
}

/**
 * Gates the route transits, ordered by how far along the route they occur.
 *
 * `sense` is left provisional here — it is computed from the course alone using the
 * registry's expectation, then re-derived once the station's real axis is loaded.
 */
export function matchGates(path: Position[], options: MatchOptions = {}): GateTransit[] {
  const gates = options.gates ?? TIDAL_GATES;
  const padding = options.radiusPaddingNm ?? 0;
  const transits: GateTransit[] = [];

  for (const gate of gates) {
    const approach = closestApproachToRoute(gate.position, path);
    if (!approach) continue;
    if (approach.distanceNm > gate.matchRadiusNm + padding) continue;

    transits.push({
      gate,
      routeDistanceNm: approach.routeDistanceNm,
      offsetNm: approach.distanceNm,
      courseDeg: approach.cogDeg,
      position: approach.at,
      legIndex: approach.legIndex,
      // Provisional: refined by refineSense once NOAA's axis for this station is known.
      sense: senseFromCourse(approach.cogDeg),
    });
  }

  return transits.sort((a, b) => a.routeDistanceNm - b.routeDistanceNm);
}

/** Crude east/west split used before the station's real axis is available. */
function senseFromCourse(courseDeg: number): TransitSense {
  return courseDeg > 0 && courseDeg < 180 ? 'eastbound' : 'westbound';
}

/** Replaces the provisional sense with one derived from the station's reported ebb axis. */
export function refineSense(transit: GateTransit, meanEbbDirDeg: number): GateTransit {
  return { ...transit, sense: classifySense(transit.courseDeg, meanEbbDirDeg) };
}

/**
 * Gates the route passes near but does not transit.
 *
 * Worth surfacing: a route down Gardiners Bay passes a few miles off The Race and is
 * genuinely affected by the water pouring through it, even though the boat never goes
 * between the islands. Telling the user "The Race is 3.4 NM off your track" is honest;
 * calling it a transit is not.
 */
export function nearbyGates(path: Position[], withinNm = 6): GateTransit[] {
  const near = matchGates(path, { radiusPaddingNm: withinNm });
  const transited = new Set(matchGates(path).map((t) => t.gate.id));
  return near.filter((t) => !transited.has(t.gate.id));
}
