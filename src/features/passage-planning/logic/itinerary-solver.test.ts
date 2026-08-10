// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseGPX } from '../../route-planning/utils/gpx';
import { parsePredictionBody } from '../../../services/noaaCurrents';
import { findGate } from '../model/gates';
import {
  solveItinerary,
  hopWindow,
  hopDateKey,
  suggestSplits,
  compareEastEndDoors,
} from './itinerary-solver';
import { DEFAULT_HOP_CONSTRAINTS, type Hop, type Itinerary, type Stop } from '../model/itinerary';
import { formatLocalTime, localDateTimeToUtc, localDateKey } from '../../../utils/time';
import { distanceNM } from '../../../utils/navigation-math';
import { daylightFor } from '../../../utils/solar';
import type { Position } from '../../../types/navigation';
import type { CurrentSample } from './propagation';
import type { EvaluationContext } from '../model/constraints';

const BOAT: EvaluationContext['boat'] = { draftFt: 4.5, airDraftFt: null, cruiseSpeedKn: 6 };

const CENTERPORT: Stop = {
  name: 'Centerport Yacht Club',
  position: { lat: 40.9015, lng: -73.3592 },
  kind: 'home',
};
const PORT_JEFFERSON: Stop = {
  name: 'Port Jefferson',
  position: { lat: 40.9465, lng: -73.0776 },
  kind: 'mooring',
};
const BLOCK_ISLAND: Stop = {
  name: 'Block Island',
  position: { lat: 41.1937, lng: -71.5811 },
  kind: 'anchorage',
};

function blockIslandPath(): Position[] {
  const xml = readFileSync('src/test/fixtures/block-island-cyc.gpx', 'utf8');
  return parseGPX(xml).waypoints.map((w) => w.position);
}

/** A short straight hop, so chain arithmetic is easy to reason about. */
function shortHopPath(from: Stop, to: Stop): Position[] {
  return [from.position, to.position];
}

function plumGutLookup() {
  const record = parsePredictionBody(
    JSON.parse(readFileSync('src/test/fixtures/noaa-plumgut-6min-20260817.json', 'utf8')) as never,
    { stationId: 'LIS1012', bin: 10, interval: '6', dateKey: '2026-08-17', fetchedAt: 0 }
  );
  const gate = findGate('plum-gut')!;
  return (position: Position, at: number): CurrentSample | null => {
    if (distanceNM(position, gate.position) > 8) return null;
    let best = record.events[0];
    for (const e of record.events) if (Math.abs(e.at - at) < Math.abs(best.at - at)) best = e;
    return {
      signedKn: best.velocityKn,
      directionDeg: best.velocityKn >= 0 ? 305 : 124,
      kind: best.kind,
    };
  };
}

function hop(id: string, from: Stop, to: Stop, dayOffset: number, overrides: Partial<Hop> = {}): Hop {
  return {
    id,
    routeId: `route-${id}`,
    fromStop: from,
    toStop: to,
    dayOffset,
    window: { earliestDeparture: '06:00', latestArrival: '19:00' },
    constraints: { ...DEFAULT_HOP_CONSTRAINTS },
    ...overrides,
  };
}

function itinerary(hops: Hop[], startDate = '2026-08-17'): Itinerary {
  return {
    id: 'trip-1',
    name: 'East to Block Island',
    startDate,
    hops,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('hop dates follow the itinerary start and day offset', () => {
  const trip = itinerary([hop('a', CENTERPORT, PORT_JEFFERSON, 0), hop('b', PORT_JEFFERSON, BLOCK_ISLAND, 1)]);

  it('day zero is the start date', () => {
    expect(hopDateKey(trip, trip.hops[0])).toBe('2026-08-17');
  });

  it('day one is the next day', () => {
    expect(hopDateKey(trip, trip.hops[1])).toBe('2026-08-18');
  });

  it('a layover day leaves a gap', () => {
    const withLayover = itinerary([hop('a', CENTERPORT, PORT_JEFFERSON, 0), hop('b', PORT_JEFFERSON, BLOCK_ISLAND, 2)]);
    expect(hopDateKey(withLayover, withLayover.hops[1])).toBe('2026-08-19');
  });
});

describe('the chain constraint', () => {
  const trip = itinerary([hop('a', CENTERPORT, PORT_JEFFERSON, 0), hop('b', PORT_JEFFERSON, BLOCK_ISLAND, 1)]);

  it('leaves the first hop to its own window', () => {
    const window = hopWindow(trip, trip.hops[0], null);
    expect(window).not.toBeNull();
    expect(window!.constrainedByPreviousHop).toBe(false);
  });

  it('pushes a departure later when rest demands it', () => {
    // Previous hop got in at 23:00; 10 h rest means no departure before 09:00.
    const arrival = localDateTimeToUtc('2026-08-17', '23:00');
    const window = hopWindow(trip, trip.hops[1], arrival);
    expect(window).not.toBeNull();
    expect(formatLocalTime(window!.earliest)).toBe('09:00');
    expect(window!.constrainedByPreviousHop).toBe(true);
  });

  it('leaves the window alone when the crew is already rested', () => {
    const arrival = localDateTimeToUtc('2026-08-17', '14:00');
    const window = hopWindow(trip, trip.hops[1], arrival);
    expect(formatLocalTime(window!.earliest)).toBe('06:00');
    expect(window!.constrainedByPreviousHop).toBe(false);
  });

  it('returns no window when rest pushes past the last acceptable arrival', () => {
    const arrival = localDateTimeToUtc('2026-08-18', '18:00');
    expect(hopWindow(trip, trip.hops[1], arrival)).toBeNull();
  });

  it('clamps a daylight-only departure to civil dawn', () => {
    const early = itinerary([
      hop('a', CENTERPORT, PORT_JEFFERSON, 0, {
        window: { earliestDeparture: '03:00', latestArrival: '19:00' },
      }),
    ]);
    const window = hopWindow(early, early.hops[0], null);
    const dawn = daylightFor(CENTERPORT.position, window!.earliest).civilDawn;
    expect(window!.earliest).toBe(dawn);
    // Well after the 03:00 the hop asked for.
    expect(formatLocalTime(window!.earliest)).not.toBe('03:00');
  });

  it('does not clamp when night sailing is allowed', () => {
    const night = itinerary([
      hop('a', CENTERPORT, PORT_JEFFERSON, 0, {
        window: { earliestDeparture: '03:00', latestArrival: '19:00' },
        constraints: { daylightOnly: false, minHoursAtStop: 10 },
      }),
    ]);
    const window = hopWindow(night, night.hops[0], null);
    expect(formatLocalTime(window!.earliest)).toBe('03:00');
  });
});

describe('solving a two-hop chain', () => {
  const hops = [hop('a', CENTERPORT, PORT_JEFFERSON, 0), hop('b', PORT_JEFFERSON, BLOCK_ISLAND, 1)];
  const trip = itinerary(hops);
  const paths = new Map<string, Position[]>([
    ['route-a', shortHopPath(CENTERPORT, PORT_JEFFERSON)],
    ['route-b', shortHopPath(PORT_JEFFERSON, BLOCK_ISLAND)],
  ]);

  const solved = solveItinerary({
    itinerary: trip,
    paths,
    cruiseSpeedKn: 6,
    boat: BOAT,
    lookupCurrent: plumGutLookup(),
  });

  it('plans every hop', () => {
    expect(solved.hops).toHaveLength(2);
  });

  it('sails each hop on its own day', () => {
    expect(localDateKey(solved.hops[0].departAt!)).toBe('2026-08-17');
    expect(localDateKey(solved.hops[1].departAt!)).toBe('2026-08-18');
  });

  it('never leaves before it has arrived the day before', () => {
    expect(solved.hops[1].departAt!).toBeGreaterThan(solved.hops[0].arriveAt!);
  });

  it('totals distance across the whole trip', () => {
    expect(solved.totalDistanceNm).toBeGreaterThan(60);
  });

  it('reports the trip as workable', () => {
    expect(solved.infeasibleHopIndexes).toEqual([]);
  });
});

describe('an impossible hop is named, not fudged', () => {
  // A hop with a window too short to cover the distance.
  const impossible = itinerary([
    hop('a', CENTERPORT, BLOCK_ISLAND, 0, {
      window: { earliestDeparture: '15:00', latestArrival: '17:00' },
    }),
  ]);
  const paths = new Map<string, Position[]>([['route-a', blockIslandPath()]]);

  const solved = solveItinerary({
    itinerary: impossible,
    paths,
    cruiseSpeedKn: 6,
    boat: BOAT,
    lookupCurrent: plumGutLookup(),
  });

  it('marks the hop infeasible rather than returning the least-bad option', () => {
    expect(solved.hops[0].infeasible).not.toBeNull();
    expect(solved.hops[0].departAt).toBeNull();
  });

  it('names the constraint that broke it', () => {
    expect(solved.hops[0].infeasible!.constraint.length).toBeGreaterThan(0);
  });

  it('offers remedies', () => {
    expect(solved.hops[0].infeasible!.remedies.length).toBeGreaterThan(0);
  });

  it('flags the hop at the itinerary level so it is visible without opening the day', () => {
    expect(solved.infeasibleHopIndexes).toEqual([0]);
  });
});

describe('a hop with no route', () => {
  const trip = itinerary([hop('a', CENTERPORT, PORT_JEFFERSON, 0)]);
  const solved = solveItinerary({
    itinerary: trip,
    paths: new Map(),
    cruiseSpeedKn: 6,
    boat: BOAT,
    lookupCurrent: () => null,
  });

  it('says the route is missing rather than silently skipping the day', () => {
    expect(solved.hops[0].infeasible?.constraint).toBe('Route');
  });
});

describe('changing the start date moves the whole chain', () => {
  const hops = [hop('a', CENTERPORT, PORT_JEFFERSON, 0), hop('b', PORT_JEFFERSON, BLOCK_ISLAND, 1)];
  const paths = new Map<string, Position[]>([
    ['route-a', shortHopPath(CENTERPORT, PORT_JEFFERSON)],
    ['route-b', shortHopPath(PORT_JEFFERSON, BLOCK_ISLAND)],
  ]);
  const lookup = plumGutLookup();

  it('re-dates every hop', () => {
    const august = solveItinerary({
      itinerary: itinerary(hops, '2026-08-17'),
      paths,
      cruiseSpeedKn: 6,
      boat: BOAT,
      lookupCurrent: lookup,
    });
    const september = solveItinerary({
      itinerary: itinerary(hops, '2026-09-17'),
      paths,
      cruiseSpeedKn: 6,
      boat: BOAT,
      lookupCurrent: lookup,
    });
    expect(localDateKey(august.hops[0].departAt!)).toBe('2026-08-17');
    expect(localDateKey(september.hops[0].departAt!)).toBe('2026-09-17');
  });
});

describe('suggesting where to split a long hop', () => {
  const path = blockIslandPath();
  const candidates: Stop[] = [
    { name: 'Mattituck', position: { lat: 41.0126, lng: -72.5462 }, kind: 'marina' },
    { name: 'Port Jefferson', position: { lat: 40.9465, lng: -73.0776 }, kind: 'mooring' },
    { name: 'Old Saybrook', position: { lat: 41.2704, lng: -72.3548 }, kind: 'marina' },
    { name: 'Newport', position: { lat: 41.4901, lng: -71.3128 }, kind: 'marina' },
  ];

  const splits = suggestSplits(path, candidates);

  it('suggests stops near the corridor', () => {
    expect(splits.length).toBeGreaterThan(0);
    expect(splits.length).toBeLessThanOrEqual(4);
  });

  it('ignores stops far off the track', () => {
    expect(splits.map((s) => s.stop.name)).not.toContain('Newport');
  });

  it('explains each suggestion in miles rather than just naming it', () => {
    for (const split of splits) {
      expect(split.reason).toMatch(/NM/);
      expect(split.reason).toContain(split.stop.name);
    }
  });

  it('prefers a split that divides the passage evenly', () => {
    const total = path.slice(1).reduce((sum, p, i) => sum + distanceNM(path[i], p), 0);
    const firstImbalance = Math.abs(0.5 - splits[0].atDistanceNm / total);
    for (const split of splits.slice(1)) {
      expect(Math.abs(0.5 - split.atDistanceNm / total)).toBeGreaterThanOrEqual(firstImbalance - 1e-9);
    }
  });
});

describe('comparing the two doors out of the Sound', () => {
  const plumGutRoute = blockIslandPath();
  const earliest = localDateTimeToUtc('2026-08-17', '04:00');
  const latest = localDateTimeToUtc('2026-08-17', '12:00');

  const comparisons = compareEastEndDoors(
    { race: null, plumGut: plumGutRoute },
    earliest,
    latest,
    6,
    BOAT,
    plumGutLookup()
  );

  it('reports both doors', () => {
    expect(comparisons.map((c) => c.door).sort()).toEqual(['plum-gut', 'the-race']);
  });

  it('says plainly when no route exists through a door rather than inventing one', () => {
    const race = comparisons.find((c) => c.door === 'the-race')!;
    expect(race.gateStatus).toBe('not-transited');
    expect(race.detail).toContain('No route saved');
  });

  it('evaluates the door that does have a route', () => {
    const plum = comparisons.find((c) => c.door === 'plum-gut')!;
    expect(plum.departAt).not.toBeNull();
    expect(plum.distanceNm).toBeGreaterThan(80);
  });
});
