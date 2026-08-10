import type { Position } from '../../../types/navigation';
import type { Utc } from '../../../utils/time';

/**
 * A cruise as it is actually sailed: a chain of day hops with nights in between.
 *
 * Modelled as the general case rather than an extension of single-hop planning — a
 * one-day trip is simply an itinerary with one hop. The spec is explicit that this must
 * be first-class, and the reason shows up immediately in the solving: a hop cannot be
 * planned in isolation because its earliest departure depends on when the previous hop
 * got in and how long the crew rested.
 */

export interface Stop {
  name: string;
  position: Position;
  kind: 'marina' | 'mooring' | 'anchorage' | 'home';
  /** Launch hours, fuel dock, reservation details — whatever matters on arrival. */
  notes?: string;
  /** Links to a saved destination when the stop came from one. */
  destinationId?: string;
}

export interface HopWindow {
  /** Local time of day, e.g. '06:00'. */
  earliestDeparture: string;
  /** Local time of day. May be after midnight for an overnight passage. */
  latestArrival: string;
}

export interface HopConstraints {
  daylightOnly: boolean;
  /** Rest between hops, in hours. */
  minHoursAtStop: number;
}

export interface Hop {
  id: string;
  /** An existing saved route. */
  routeId: string;
  fromStop: Stop;
  toStop: Stop;
  /** 0-based day of the itinerary. Gaps allow layover days. */
  dayOffset: number;
  window: HopWindow;
  constraints: HopConstraints;
}

export interface Itinerary {
  id: string;
  name: string;
  /** Local date of the day-one departure, `YYYY-MM-DD`. */
  startDate: string;
  hops: Hop[];
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export const DEFAULT_HOP_CONSTRAINTS: HopConstraints = {
  daylightOnly: true,
  minHoursAtStop: 10,
};

export const DEFAULT_HOP_WINDOW: HopWindow = {
  earliestDeparture: '06:00',
  latestArrival: '19:00',
};

/** Why a hop could not be planned, in terms a skipper can act on. */
export interface HopInfeasibility {
  /** The constraint that broke it. */
  constraint: string;
  detail: string;
  remedies: string[];
}

export interface SolvedHop {
  hop: Hop;
  departAt: Utc | null;
  arriveAt: Utc | null;
  distanceNm: number;
  elapsedHours: number;
  /** Gates transited, with their verdict at the planned time. */
  gates: Array<{ name: string; at: Utc; status: 'ok' | 'caution' | 'fail' | 'unknown'; detail: string }>;
  /** Set when the hop cannot be sailed as specified. */
  infeasible: HopInfeasibility | null;
  /** Constraints that could not be assessed. */
  unknownCount: number;
  /**
   * True when this hop's departure was pushed later by the previous hop's arrival plus
   * rest, rather than by its own window. Worth showing: it means the chain is binding.
   */
  constrainedByPreviousHop: boolean;
}

export interface SolvedItinerary {
  itinerary: Itinerary;
  hops: SolvedHop[];
  /** Whole-trip totals, over the hops that could be solved. */
  totalDistanceNm: number;
  totalHours: number;
  /** Indices of hops that could not be planned. */
  infeasibleHopIndexes: number[];
}

export function itineraryIsFeasible(solved: SolvedItinerary): boolean {
  return solved.infeasibleHopIndexes.length === 0;
}
