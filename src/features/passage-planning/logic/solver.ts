import type { Position } from '../../../types/navigation';
import { formatLocalTime, type Utc } from '../../../utils/time';
import type {
  ConstraintBinding,
  ConstraintOutcome,
  EvaluationContext,
} from '../model/constraints';
import { isBlocking, penaltyOf } from '../model/constraints';
import { evaluate } from './evaluators';
import { closestApproachToRoute } from '../../../utils/route-geometry';
import {
  arrivalAtDistance,
  projectPassageIterated,
  type CurrentLookup,
  type PassageProjection,
} from './propagation';

/**
 * Choosing a departure time.
 *
 * Sample the window, project each candidate, evaluate every constraint the route picks
 * up, and rank. The solver never learns what a constraint *is* — it adds penalties, is
 * blocked by failures, and counts unknowns.
 */

export interface SolveOptions {
  path: Position[];
  earliest: Utc;
  latest: Utc;
  cruiseSpeedKn: number;
  bindings: ConstraintBinding[];
  lookupCurrent: CurrentLookup;
  /** Fills in tide, wind and daylight for a place and moment. */
  contextAt?: (position: Position, at: Utc) => Partial<EvaluationContext>;
  boat: EvaluationContext['boat'];
  /** Minutes between candidate departures. Ten is plenty (spec §6). */
  stepMinutes?: number;
}

export interface DepartureOption {
  departAt: Utc;
  arriveAt: Utc;
  elapsedHours: number;
  outcomes: ConstraintOutcome[];
  /** Lower is better. Infinity when a constraint fails outright. */
  score: number;
  feasible: boolean;
  /** Constraints that could not be assessed — the honesty counter. */
  unknownCount: number;
  projection: PassageProjection;
}

/**
 * A run of adjacent departure times that all work, represented by its best moment.
 *
 * Ranking raw 10-minute samples produces five "alternatives" that differ by ten minutes
 * and score identically — useless as choices. What a skipper actually wants to know is
 * "leave around 07:40, anywhere from 06:50 to 08:30", and separately "or there is another
 * window this evening".
 */
export interface DepartureWindow {
  opensAt: Utc;
  closesAt: Utc;
  best: DepartureOption;
}

export interface SolveResult {
  options: DepartureOption[];
  /** Best feasible option, or null when every candidate fails. */
  best: DepartureOption | null;
  /** Genuinely distinct alternatives, best first. */
  windows: DepartureWindow[];
  /** Why no departure works, when none does. */
  infeasibleReason: string | null;
  /** Distinct remedies gathered from the failures, for showing the user a way out. */
  remedies: string[];
}

/**
 * Groups feasible departures into contiguous windows.
 *
 * A gap longer than `maxGapMinutes` between usable departures starts a new window, so
 * a morning and an evening opportunity are reported as two choices rather than fifty.
 */
export function groupIntoWindows(
  feasible: DepartureOption[],
  stepMinutes: number
): DepartureWindow[] {
  if (feasible.length === 0) return [];

  const byTime = [...feasible].sort((a, b) => a.departAt - b.departAt);
  const maxGapMs = stepMinutes * 60_000 * 1.5;
  const windows: DepartureWindow[] = [];
  let run: DepartureOption[] = [byTime[0]];

  for (let i = 1; i < byTime.length; i++) {
    if (byTime[i].departAt - byTime[i - 1].departAt <= maxGapMs) {
      run.push(byTime[i]);
    } else {
      windows.push(toWindow(run));
      run = [byTime[i]];
    }
  }
  windows.push(toWindow(run));

  return windows.sort((a, b) => a.best.score - b.best.score);
}

function toWindow(run: DepartureOption[]): DepartureWindow {
  const best = run.reduce((a, b) => (b.score < a.score ? b : a));
  return { opensAt: run[0].departAt, closesAt: run[run.length - 1].departAt, best };
}

/** Passage duration matters, but not as much as arriving at a gate on a foul tide. */
const HOURS_PENALTY_PER_HOUR = 6;

/** An unassessed constraint is not free — it should not outrank a fully-checked option. */
const UNKNOWN_PENALTY = 15;

/**
 * Where along the route each binding applies.
 *
 * Feature bindings match against the track. Destination bindings pin to the start or the
 * end, which is what "on arrival" and "on departure" mean for a single hop.
 */
function locateBinding(
  binding: ConstraintBinding,
  path: Position[],
  totalDistanceNm: number
): { routeDistanceNm: number; position: Position } | null {
  if (binding.appliesTo.kind === 'feature') {
    const approach = closestApproachToRoute(binding.appliesTo.position, path);
    if (!approach || approach.distanceNm > binding.appliesTo.matchRadiusNm) return null;
    return { routeDistanceNm: approach.routeDistanceNm, position: approach.at };
  }

  const on = binding.appliesTo.on;
  if (on === 'departure') return { routeDistanceNm: 0, position: path[0] };
  return { routeDistanceNm: totalDistanceNm, position: path[path.length - 1] };
}

function scoreOption(option: Omit<DepartureOption, 'score' | 'feasible'>): {
  score: number;
  feasible: boolean;
} {
  if (option.outcomes.some((o) => isBlocking(o.verdict))) {
    return { score: Number.POSITIVE_INFINITY, feasible: false };
  }
  const penalties = option.outcomes.reduce((sum, o) => sum + penaltyOf(o.verdict), 0);
  const unknowns = option.unknownCount * UNKNOWN_PENALTY;
  return {
    score: penalties + unknowns + option.elapsedHours * HOURS_PENALTY_PER_HOUR,
    feasible: true,
  };
}

export function solveDeparture(options: SolveOptions): SolveResult {
  const {
    path,
    earliest,
    latest,
    cruiseSpeedKn,
    bindings,
    lookupCurrent,
    contextAt,
    boat,
    stepMinutes = 10,
  } = options;

  const candidates: DepartureOption[] = [];
  const stepMs = stepMinutes * 60_000;

  for (let departAt = earliest; departAt <= latest; departAt += stepMs) {
    const { projection } = projectPassageIterated(path, departAt, cruiseSpeedKn, lookupCurrent);
    const outcomes: ConstraintOutcome[] = [];

    for (const binding of bindings) {
      if (!binding.enabled) continue;
      const placement = locateBinding(binding, path, projection.totalDistanceNm);
      if (!placement) continue;

      const arrival = arrivalAtDistance(projection, placement.routeDistanceNm);
      const at = arrival?.at ?? projection.departAt;
      const courseDeg = arrival?.courseDeg ?? 0;

      const sample = lookupCurrent(placement.position, at);
      const context: EvaluationContext = {
        at,
        courseDeg,
        boat,
        ...(sample
          ? {
              currents: {
                speedKn: Math.abs(sample.signedKn),
                // Projected onto the course, so "fair" and "foul" are relative to the boat.
                signedKn: alongTrack(sample.signedKn, sample.directionDeg, courseDeg),
                directionDeg: sample.directionDeg,
                kind: sample.kind,
              },
            }
          : {}),
        ...(contextAt?.(placement.position, at) ?? {}),
      };

      outcomes.push({
        bindingId: binding.id,
        label: binding.label,
        kind: binding.constraint.kind,
        routeDistanceNm: placement.routeDistanceNm,
        at,
        verdict: evaluate(binding.constraint, context),
      });
    }

    outcomes.sort((a, b) => a.routeDistanceNm - b.routeDistanceNm);

    const base = {
      departAt,
      arriveAt: projection.arriveAt,
      elapsedHours: projection.elapsedHours,
      outcomes,
      unknownCount: outcomes.filter((o) => o.verdict.status === 'unknown').length,
      projection,
    };
    candidates.push({ ...base, ...scoreOption(base) });
  }

  const feasible = candidates.filter((c) => c.feasible).sort((a, b) => a.score - b.score);

  if (feasible.length > 0) {
    return {
      options: feasible,
      best: feasible[0],
      windows: groupIntoWindows(feasible, stepMinutes),
      infeasibleReason: null,
      remedies: [],
    };
  }

  // Nothing works. Say which constraint broke it and what could be done, rather than
  // ranking the least-bad option as though it were a recommendation (spec §9.4).
  const failures = candidates.flatMap((c) =>
    c.outcomes.filter((o) => o.verdict.status === 'fail')
  );
  const byLabel = new Map<string, string>();
  const remedies = new Set<string>();
  for (const failure of failures) {
    if (failure.verdict.status !== 'fail') continue;
    if (!byLabel.has(failure.label)) byLabel.set(failure.label, failure.verdict.detail);
    failure.verdict.remedies.forEach((r) => remedies.add(r));
  }

  const window = `${formatLocalTime(earliest)}–${formatLocalTime(latest)}`;
  const reason =
    byLabel.size === 0
      ? `No departure between ${window} could be evaluated.`
      : `No departure between ${window} works. ` +
        [...byLabel.entries()].map(([label, detail]) => `${label}: ${detail}`).join(' ');

  return {
    options: candidates.sort((a, b) => a.departAt - b.departAt),
    best: null,
    windows: [],
    infeasibleReason: reason,
    remedies: [...remedies],
  };
}

/** Local copy to avoid a circular import; identical to route-geometry's projection. */
function alongTrack(signedKn: number, directionDeg: number, courseDeg: number): number {
  const rad = ((directionDeg - courseDeg) * Math.PI) / 180;
  return Math.abs(signedKn) * Math.cos(rad);
}

/**
 * A sentence a skipper can act on, per spec §6.
 * "Leave Centerport at 04:40 to carry the ebb through Plum Gut at 09:20 (2.9 kn fair)."
 */
export function describeOption(option: DepartureOption, fromName: string): string {
  const depart = formatLocalTime(option.departAt);
  const gates = option.outcomes.filter((o) => o.kind === 'current-gate');

  if (gates.length === 0) {
    return `Leave ${fromName} at ${depart} — ${option.elapsedHours.toFixed(1)} h passage, arriving ${formatLocalTime(option.arriveAt)}.`;
  }

  const parts = gates.map((g) => `${g.label} at ${formatLocalTime(g.at)} (${g.verdict.detail})`);
  return `Leave ${fromName} at ${depart} — ${parts.join('; ')}. Arrive ${formatLocalTime(option.arriveAt)}.`;
}
