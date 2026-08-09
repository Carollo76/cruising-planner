import type { Position } from '../../../types/navigation';
import type { Utc } from '../../../utils/time';

/**
 * What makes a departure time good or bad.
 *
 * Tidal gates and harbour depth are not two features; they are two answers to one
 * question — "is this a sensible moment to be at this place?". Modelling them as one
 * kind of thing means the solver, the scoring and the timeline are written once, and a
 * destination declares whatever happens to matter about itself. Adding a caveat to a
 * place is then pure data; adding a *kind* of caveat is a variant plus an evaluator.
 */

/** A narrow passage where tidal current dominates the transit. */
export interface CurrentGateConstraint {
  kind: 'current-gate';
  stationId: string;
  bin: number;
  /** Above this, a foul transit is impractical rather than merely slow. */
  cautionSpeedKn: number;
  /** Foul current at or above this fails outright. */
  hardFoulSpeedKn: number;
}

/** Somewhere that needs a minimum depth of water at the time of passing. */
export interface TideHeightConstraint {
  kind: 'tide-height';
  /** NOAA water-level station used for the height prediction. */
  stationId: string;
  /**
   * Charted controlling depth at MLLW, in feet. Null when unknown — which yields an
   * 'unknown' verdict rather than a guess. Never populate this from estimation.
   */
  controllingDepthFt: number | null;
  /** Clearance wanted under the keel beyond draft, in feet. */
  safetyMarginFt: number;
}

/** Arrive or depart between civil dawn and dusk. */
export interface DaylightConstraint {
  kind: 'daylight';
  /** Allow the leg to run into darkness if the destination is straightforward. */
  allowNightArrival: boolean;
}

/** A bridge with an opening schedule, an air draft limit, or both. */
export interface BridgeConstraint {
  kind: 'bridge';
  /** Vertical clearance at MHW in feet; null when the bridge always opens. */
  closedClearanceFt: number | null;
  /** Local time-of-day windows when it will open, e.g. ['06:00-21:00']. */
  openingWindows: string[];
  /** Minutes of notice required, if any. */
  noticeMinutes: number | null;
}

/** Somewhere with operating hours: launch service, fuel dock, harbourmaster. */
export interface ServiceHoursConstraint {
  kind: 'service-hours';
  service: 'launch' | 'fuel' | 'harbourmaster' | 'lock';
  /** Local time-of-day windows, e.g. ['08:00-18:00']. */
  windows: string[];
}

/** An inlet or bar where wind against tide builds a dangerous sea. */
export interface SeaStateConstraint {
  kind: 'sea-state';
  /** Axis the sea runs on, degrees true. */
  exposureDeg: number;
  /** Sustained wind at or above this, opposing the current, is the warning threshold. */
  warnWindKn: number;
}

export type PlanningConstraint =
  | CurrentGateConstraint
  | TideHeightConstraint
  | DaylightConstraint
  | BridgeConstraint
  | ServiceHoursConstraint
  | SeaStateConstraint;

export type ConstraintKind = PlanningConstraint['kind'];

/** Where a constraint applies. */
export type ConstraintTarget =
  | { kind: 'destination'; destinationId: string; on: 'arrival' | 'departure' | 'both' }
  | { kind: 'feature'; position: Position; matchRadiusNm: number };

export interface ConstraintBinding {
  id: string;
  /** Shown to the user; the constraint kind is an implementation detail. */
  label: string;
  constraint: PlanningConstraint;
  appliesTo: ConstraintTarget;
  /** Where the numbers came from. Seeded values cite a chart; invented ones do not exist. */
  source: 'seed' | 'user';
  sourceNote?: string;
  enabled: boolean;
}

/**
 * The outcome of evaluating one constraint at one moment.
 *
 * `unknown` is deliberately a first-class result rather than an absence. A recommendation
 * that quietly skipped the harbour depth because nobody recorded it is worse than one
 * that says so — the spec makes the same demand of missing wave and polar data.
 */
export type ConstraintVerdict =
  | { status: 'ok'; detail: string }
  | { status: 'caution'; detail: string; penalty: number }
  | { status: 'fail'; detail: string; remedies: string[] }
  | { status: 'unknown'; detail: string };

/** Everything an evaluator may need about the moment the boat is at the place. */
export interface EvaluationContext {
  at: Utc;
  /** Boat's course over ground there, degrees true. */
  courseDeg: number;
  boat: {
    draftFt: number;
    airDraftFt: number | null;
    cruiseSpeedKn: number;
  };
  /** Resolved from cache; absent means offline with nothing stored. */
  currents?: {
    speedKn: number;
    /** Signed along the station's major axis: positive flood. */
    signedKn: number;
    directionDeg: number;
    kind: 'flood' | 'ebb' | 'slack';
  };
  tideHeightFt?: number;
  wind?: { speedKn: number; directionDeg: number };
  daylight?: { civilDawn: Utc; civilDusk: Utc };
}

export type ConstraintEvaluator<C extends PlanningConstraint> = (
  constraint: C,
  context: EvaluationContext
) => ConstraintVerdict;

/** A constraint evaluated at a particular point on a particular passage. */
export interface ConstraintOutcome {
  bindingId: string;
  label: string;
  kind: ConstraintKind;
  /** Distance along the route where this applies, NM from the start. */
  routeDistanceNm: number;
  at: Utc;
  verdict: ConstraintVerdict;
}

export function isBlocking(verdict: ConstraintVerdict): boolean {
  return verdict.status === 'fail';
}

export function penaltyOf(verdict: ConstraintVerdict): number {
  return verdict.status === 'caution' ? verdict.penalty : 0;
}
