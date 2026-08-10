import type { Position } from '../../../types/navigation';
import { addHours, localDateKey, localDateTimeToUtc, type Utc } from '../../../utils/time';
import { daylightFor } from '../../../utils/solar';
import { distanceNM } from '../../../utils/navigation-math';
import { matchGates } from './matching';
import { closestApproachToRoute } from '../../../utils/route-geometry';
import { gateBinding } from '../model/gates';
import { solveDeparture, type SolveResult } from './solver';
import type { CurrentLookup } from './propagation';
import type { ConstraintBinding, EvaluationContext } from '../model/constraints';
import type {
  Hop,
  Itinerary,
  SolvedHop,
  SolvedItinerary,
  Stop,
} from '../model/itinerary';

/**
 * Solving a chain of day hops.
 *
 * Each hop is solved with the existing single-hop solver, then the chain constraint is
 * applied in order: a hop cannot leave before the previous one arrived plus the rest the
 * crew asked for. Daylight clamps the window to civil twilight at the stop.
 *
 * When a hop has no feasible departure it is marked infeasible with the constraint that
 * broke it and what could be done about it — never quietly given the least-bad answer.
 */

export interface ItinerarySolveInput {
  itinerary: Itinerary;
  /** Waypoint path for each hop's route, by route id. */
  paths: Map<string, Position[]>;
  cruiseSpeedKn: number;
  boat: EvaluationContext['boat'];
  lookupCurrent: CurrentLookup;
}

/** The local date a hop departs, given the itinerary start and the hop's day offset. */
export function hopDateKey(itinerary: Itinerary, hop: Hop): string {
  const start = localDateTimeToUtc(itinerary.startDate, '12:00');
  return localDateKey(addHours(start, 24 * hop.dayOffset));
}

/**
 * The window a hop may depart in, after the chain and daylight constraints.
 *
 * Returns null when the constraints leave no window at all — for instance when required
 * rest pushes the earliest departure past the last usable light.
 */
export function hopWindow(
  itinerary: Itinerary,
  hop: Hop,
  previousArrival: Utc | null
): {
  earliest: Utc;
  latest: Utc;
  arrivalDeadline: Utc;
  constrainedByPreviousHop: boolean;
} | null {
  const dateKey = hopDateKey(itinerary, hop);
  let earliest = localDateTimeToUtc(dateKey, hop.window.earliestDeparture);
  let arrivalDeadline = localDateTimeToUtc(dateKey, hop.window.latestArrival);

  // An arrival earlier on the clock than the departure means an overnight passage.
  if (arrivalDeadline <= earliest) arrivalDeadline = addHours(arrivalDeadline, 24);

  let constrainedByPreviousHop = false;
  if (previousArrival !== null) {
    const readyAt = addHours(previousArrival, hop.constraints.minHoursAtStop);
    if (readyAt > earliest) {
      earliest = readyAt;
      constrainedByPreviousHop = true;
    }
  }

  if (hop.constraints.daylightOnly) {
    // Depart no earlier than civil dawn at the stop being left.
    const dawn = daylightFor(hop.fromStop.position, earliest).civilDawn;
    if (dawn > earliest) earliest = dawn;
  }

  // You cannot leave after you are due in; the deadline itself is the latest departure
  // worth trying. Whether a given departure actually makes it is the arrival-deadline
  // constraint's job, since only the projection knows how long the passage takes.
  const latest = arrivalDeadline;
  if (earliest > latest) return null;
  return { earliest, latest, arrivalDeadline, constrainedByPreviousHop };
}

function gateSummary(result: SolveResult): SolvedHop['gates'] {
  const best = result.best;
  if (!best) return [];
  return best.outcomes
    .filter((o) => o.kind === 'current-gate')
    .map((o) => ({ name: o.label, at: o.at, status: o.verdict.status, detail: o.verdict.detail }));
}

export function solveItinerary(input: ItinerarySolveInput): SolvedItinerary {
  const { itinerary, paths, cruiseSpeedKn, boat, lookupCurrent } = input;
  const hops: SolvedHop[] = [];
  let previousArrival: Utc | null = null;

  const ordered = [...itinerary.hops].sort((a, b) => a.dayOffset - b.dayOffset);

  for (const hop of ordered) {
    const path = paths.get(hop.routeId);

    if (!path || path.length < 2) {
      hops.push(emptyHop(hop, {
        constraint: 'Route',
        detail: 'This hop has no saved route with at least two waypoints.',
        remedies: ['Plan a route for this hop', 'Remove the hop from the itinerary'],
      }));
      continue;
    }

    const window = hopWindow(itinerary, hop, previousArrival);
    if (!window) {
      hops.push(emptyHop(hop, {
        constraint: 'Rest and daylight',
        detail:
          `Waiting ${hop.constraints.minHoursAtStop} h at ${hop.fromStop.name} pushes departure ` +
          `past the end of this hop's window.`,
        remedies: [
          'Shorten the rest required at this stop',
          'Accept a night departure or arrival',
          'Add a layover day before this hop',
        ],
      }));
      continue;
    }

    const bindings: ConstraintBinding[] = [
      ...matchGates(path).map((t) => gateBinding(t.gate)),
      {
        id: `deadline:${hop.id}`,
        label: `In by ${hop.window.latestArrival}`,
        constraint: { kind: 'arrival-deadline', deadline: window.arrivalDeadline },
        appliesTo: { kind: 'destination', destinationId: hop.toStop.destinationId ?? 'end', on: 'arrival' },
        source: 'seed',
        enabled: true,
      },
      {
        id: `daylight:${hop.id}`,
        label: `Arrival at ${hop.toStop.name}`,
        constraint: { kind: 'daylight', allowNightArrival: !hop.constraints.daylightOnly },
        appliesTo: { kind: 'destination', destinationId: hop.toStop.destinationId ?? 'end', on: 'arrival' },
        source: 'seed',
        enabled: true,
      },
    ];

    const result = solveDeparture({
      path,
      earliest: window.earliest,
      latest: window.latest,
      cruiseSpeedKn,
      bindings,
      lookupCurrent,
      boat,
      contextAt: (_position, at) => ({ daylight: daylightFor(hop.toStop.position, at) }),
      stepMinutes: 10,
    });

    const distanceNm = path.slice(1).reduce((sum, p, i) => sum + distanceNM(path[i], p), 0);

    if (!result.best) {
      const firstFail = result.allOptions
        .flatMap((o) => o.outcomes)
        .find((o) => o.verdict.status === 'fail');
      hops.push({
        hop,
        departAt: null,
        arriveAt: null,
        distanceNm,
        elapsedHours: 0,
        gates: [],
        infeasible: {
          constraint: firstFail?.label ?? 'Departure window',
          detail: result.infeasibleReason ?? 'No workable departure in this window.',
          remedies: result.remedies.length > 0 ? result.remedies : ['Widen the departure window'],
        },
        unknownCount: 0,
        constrainedByPreviousHop: window.constrainedByPreviousHop,
      });
      // A broken hop breaks the chain; later hops are planned from their own windows.
      previousArrival = null;
      continue;
    }

    hops.push({
      hop,
      departAt: result.best.departAt,
      arriveAt: result.best.arriveAt,
      distanceNm,
      elapsedHours: result.best.elapsedHours,
      gates: gateSummary(result),
      infeasible: null,
      unknownCount: result.best.unknownCount,
      constrainedByPreviousHop: window.constrainedByPreviousHop,
    });
    previousArrival = result.best.arriveAt;
  }

  const solvedHops = hops.filter((h) => h.infeasible === null);
  return {
    itinerary,
    hops,
    totalDistanceNm: hops.reduce((sum, h) => sum + h.distanceNm, 0),
    totalHours: solvedHops.reduce((sum, h) => sum + h.elapsedHours, 0),
    infeasibleHopIndexes: hops.flatMap((h, i) => (h.infeasible ? [i] : [])),
  };
}

function emptyHop(hop: Hop, infeasible: SolvedHop['infeasible']): SolvedHop {
  return {
    hop,
    departAt: null,
    arriveAt: null,
    distanceNm: 0,
    elapsedHours: 0,
    gates: [],
    infeasible,
    unknownCount: 0,
    constrainedByPreviousHop: false,
  };
}

/* ────────────────────────── East-end routing choice (§9) ────────────────────────── */

export interface DoorComparison {
  door: 'the-race' | 'plum-gut';
  name: string;
  departAt: Utc | null;
  arriveAt: Utc | null;
  gateStatus: 'ok' | 'caution' | 'fail' | 'unknown' | 'not-transited';
  detail: string;
  distanceNm: number;
  elapsedHours: number;
}

/**
 * Evaluates two candidate routes out of the Sound and reports which door works better.
 *
 * The Race and Plum Gut are alternative branches, not a sequence — a route through one
 * says nothing about the other — so this takes two distinct routes and compares them on
 * the same day rather than trying to infer a branch from a single track.
 */
export function compareEastEndDoors(
  routes: { race: Position[] | null; plumGut: Position[] | null },
  earliest: Utc,
  latest: Utc,
  cruiseSpeedKn: number,
  boat: EvaluationContext['boat'],
  lookupCurrent: CurrentLookup
): DoorComparison[] {
  const comparisons: DoorComparison[] = [];

  const candidates: Array<{ door: DoorComparison['door']; name: string; path: Position[] | null }> = [
    { door: 'the-race', name: 'The Race', path: routes.race },
    { door: 'plum-gut', name: 'Plum Gut', path: routes.plumGut },
  ];

  for (const candidate of candidates) {
    if (!candidate.path || candidate.path.length < 2) {
      comparisons.push({
        door: candidate.door,
        name: candidate.name,
        departAt: null,
        arriveAt: null,
        gateStatus: 'not-transited',
        detail: 'No route saved through this door.',
        distanceNm: 0,
        elapsedHours: 0,
      });
      continue;
    }

    const transits = matchGates(candidate.path);
    const bindings = transits.map((t) => gateBinding(t.gate));
    const result = solveDeparture({
      path: candidate.path,
      earliest,
      latest,
      cruiseSpeedKn,
      bindings,
      lookupCurrent,
      boat,
      stepMinutes: 10,
    });

    const distanceNm = candidate.path
      .slice(1)
      .reduce((sum, p, i) => sum + distanceNM(candidate.path![i], p), 0);

    const gate = result.best?.outcomes.find((o) => o.kind === 'current-gate');
    comparisons.push({
      door: candidate.door,
      name: candidate.name,
      departAt: result.best?.departAt ?? null,
      arriveAt: result.best?.arriveAt ?? null,
      gateStatus: gate?.verdict.status ?? (transits.length === 0 ? 'not-transited' : 'unknown'),
      detail: gate?.verdict.detail ?? result.infeasibleReason ?? 'No gate transited on this route.',
      distanceNm,
      elapsedHours: result.best?.elapsedHours ?? 0,
    });
  }

  return comparisons;
}

/* ────────────────────────── Alternative stops (§9) ────────────────────────── */

export interface AlternativeSplit {
  stop: Stop;
  /** How far along the original hop the alternative sits, in NM. */
  atDistanceNm: number;
  /** Distance off the direct track. */
  detourNm: number;
  reason: string;
}

/**
 * Suggests places to break a hop that is too long or infeasible.
 *
 * Deliberately a small, explainable search rather than an optimiser: candidates near the
 * corridor, ordered by how evenly they divide the passage. The spec asks for a suggestion
 * list, and a suggestion the skipper cannot reason about is worse than none.
 */
export function suggestSplits(
  path: Position[],
  candidates: Stop[],
  options: { maxDetourNm?: number; maxSuggestions?: number } = {}
): AlternativeSplit[] {
  const maxDetour = options.maxDetourNm ?? 8;
  const maxSuggestions = options.maxSuggestions ?? 4;

  const total = path.slice(1).reduce((sum, p, i) => sum + distanceNM(path[i], p), 0);
  if (total === 0) return [];

  const splits: AlternativeSplit[] = [];
  for (const stop of candidates) {
    // Measured to the track. Waypoint distance is useless here for the same reason it
    // was for gate matching: this route's longest leg is 51 NM with nothing in between,
    // so a stop beside the track can be 25 NM from the nearest waypoint.
    const approach = closestApproachToRoute(stop.position, path);
    if (!approach) continue;
    const bestOffset = approach.distanceNm;
    const bestAt = approach.routeDistanceNm;

    if (bestOffset > maxDetour) continue;
    // Prefer stops that actually break the passage, not ones at either end.
    const fraction = bestAt / total;
    if (fraction < 0.2 || fraction > 0.8) continue;

    splits.push({
      stop,
      atDistanceNm: bestAt,
      detourNm: bestOffset,
      reason:
        `${stop.name} sits ${bestOffset.toFixed(1)} NM off the track, ` +
        `${bestAt.toFixed(0)} NM in — splitting the ${total.toFixed(0)} NM hop into ` +
        `${bestAt.toFixed(0)} and ${(total - bestAt).toFixed(0)} NM days.`,
    });
  }

  // Most balanced splits first.
  return splits
    .sort((a, b) => Math.abs(0.5 - a.atDistanceNm / total) - Math.abs(0.5 - b.atDistanceNm / total))
    .slice(0, maxSuggestions);
}
