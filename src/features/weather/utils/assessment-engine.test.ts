import { describe, it, expect } from 'vitest';
import { positionAtHour, assessHourForTest, findBailoutPoints } from './assessment-engine';
import { DEFAULT_THRESHOLDS } from '../../../constants/weather-thresholds';
import type { Route, Waypoint } from '../../../types/navigation';
import type { Destination } from '../../../types/destination';

/**
 * The rule under test is the repo's own: missing data must never read as benign.
 *
 * Every defect found in this engine so far has erred toward optimism — a gate that never
 * matched, current read 158 ft below the keel, a peak that reported zero, a window list
 * that ignored current, a fetch failure that vanished into a console.warn. Absent inputs
 * rating as 'go' was the same bias in its purest form.
 */

function waypoint(id: string, lat: number, lng: number, order: number): Waypoint {
  return {
    id,
    routeId: 'r',
    position: { lat, lng },
    name: id,
    sequenceOrder: order,
    waypointType: order === 0 ? 'departure' : 'destination',
  };
}

function route(): Route {
  return {
    id: 'r',
    name: 'Test',
    createdAt: 0,
    updatedAt: 0,
    totalDistanceNM: 12,
    totalEstimatedTimeHours: 2,
    totalEstimatedFuelGallons: 3,
    expectedSpeedKnots: 6,
    fuelConsumptionGPH: 1.5,
    waypoints: [waypoint('a', 41.0, -72.5, 0), waypoint('b', 41.2, -72.5, 1)],
    legs: [
      {
        fromWaypointId: 'a',
        toWaypointId: 'b',
        distanceNM: 12,
        bearingTrue: 0,
        bearingMagnetic: 347,
        estimatedTimeHours: 2,
        estimatedFuelGallons: 3,
      },
    ],
  };
}

const AT = Date.UTC(2026, 7, 17, 12, 0);
const CALM = { timestamp: AT, windSpeedKnots: 6, gustKnots: 8, waveHeightFt: 1 };

describe('missing forecast data is not benign data', () => {
  it('rates a fully-reported calm hour as go', () => {
    const result = assessHourForTest({ point: CALM, thresholds: DEFAULT_THRESHOLDS });
    expect(result.overallRating).toBe('go');
    expect(result.missingInputs).toEqual([]);
  });

  it('refuses to rate an hour go when wave data is absent', () => {
    const result = assessHourForTest({
      point: { timestamp: AT, windSpeedKnots: 6, gustKnots: 8 },
      thresholds: DEFAULT_THRESHOLDS,
    });
    expect(result.overallRating).not.toBe('go');
    expect(result.missingInputs).toContain('wave height');
  });

  it('refuses to rate an hour go when wind data is absent', () => {
    const result = assessHourForTest({
      point: { timestamp: AT, waveHeightFt: 1, gustKnots: 8 },
      thresholds: DEFAULT_THRESHOLDS,
    });
    expect(result.overallRating).not.toBe('go');
    expect(result.missingInputs).toContain('wind');
  });

  it('names every missing input rather than only the first', () => {
    const result = assessHourForTest({ point: { timestamp: AT }, thresholds: DEFAULT_THRESHOLDS });
    expect(result.missingInputs).toEqual(['wind', 'gusts', 'wave height']);
  });

  it('says the caution is from absent data, not from known bad conditions', () => {
    const result = assessHourForTest({
      point: { timestamp: AT, windSpeedKnots: 6, gustKnots: 8 },
      thresholds: DEFAULT_THRESHOLDS,
    });
    expect(result.warnings.join(' ')).toMatch(/could not be checked/);
  });

  it('still reports genuinely bad conditions as no-go, not merely caution', () => {
    const result = assessHourForTest({
      point: { timestamp: AT, windSpeedKnots: 45, gustKnots: 60, waveHeightFt: 12 },
      thresholds: DEFAULT_THRESHOLDS,
    });
    expect(result.overallRating).toBe('no-go');
  });
});

describe('current only rates inside a critical passage', () => {
  const inPassage = {
    point: CALM,
    thresholds: DEFAULT_THRESHOLDS,
    currentStationName: 'The Race',
    inCriticalPassage: true,
  };

  it('ignores a mild current', () => {
    const result = assessHourForTest({
      ...inPassage,
      current: { timestamp: 0, speedKnots: 1, directionDeg: 108, absSpeedKnots: 1, type: 'ebb' },
    });
    expect(result.overallRating).toBe('go');
  });

  it('cautions on a significant current', () => {
    const result = assessHourForTest({
      ...inPassage,
      current: { timestamp: 0, speedKnots: 2, directionDeg: 108, absSpeedKnots: 2, type: 'ebb' },
    });
    expect(result.overallRating).toBe('caution');
  });

  it('calls a dangerous current no-go', () => {
    const result = assessHourForTest({
      ...inPassage,
      current: { timestamp: 0, speedKnots: 4, directionDeg: 108, absSpeedKnots: 4, type: 'ebb' },
    });
    expect(result.overallRating).toBe('no-go');
  });

  it('warns about wind against tide', () => {
    const result = assessHourForTest({
      ...inPassage,
      point: { timestamp: AT, windSpeedKnots: 18, gustKnots: 22, waveHeightFt: 2 },
      current: { timestamp: 0, speedKnots: 2.5, directionDeg: 108, absSpeedKnots: 2.5, type: 'ebb' },
    });
    expect(result.warnings.join(' ')).toMatch(/standing waves/);
  });
});

describe('position along the route', () => {
  const r = route();

  it('starts at the first waypoint', () => {
    expect(positionAtHour(r, 0).position).toEqual(r.waypoints[0].position);
  });

  it('is halfway at half the passage time', () => {
    const halfway = positionAtHour(r, 1).position;
    expect(halfway.lat).toBeCloseTo(41.1, 2);
  });

  it('clamps at the destination beyond the end', () => {
    const beyond = positionAtHour(r, 99).position;
    expect(beyond.lat).toBeCloseTo(41.2, 2);
  });

  it('clamps at the start for a negative hour', () => {
    expect(positionAtHour(r, -5).position).toEqual(r.waypoints[0].position);
  });
});

/* ────────────────────────────── Bailout points ────────────────────────────── */

function place(
  id: string,
  lat: number,
  lng: number,
  type: Destination['type']
): Destination {
  return {
    id,
    name: id,
    type,
    position: { lat, lng },
    region: 'new-england',
    amenities: {
      fuel: false, water: false, electric: false, pumpout: false, showers: false,
      laundry: false, wifi: false, restaurant: false, groceries: false, repairs: false,
      dinghyDock: false, pool: false, ice: false, propane: false,
    },
    details: {
      type: 'anchorage',
      holdingQuality: 'good',
      bottomType: 'mud',
      typicalDepthFeet: 12,
      protectionFrom: ['N', 'NE'],
      exposedTo: ['S'],
    },
    reviews: [],
    isUserAdded: false,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('bailout points', () => {
  // A due-north 12 NM leg at 6 kn: two hours, 6 NM per hour.
  const r = route();

  it('finds a harbour beside the track', () => {
    const bailouts = findBailoutPoints(r, [place('Close', 41.1, -72.45, 'anchorage')]);
    expect(bailouts).toHaveLength(1);
    expect(bailouts[0].distanceFromRouteNM).toBeLessThan(3);
  });

  it('ignores a harbour beyond the search radius', () => {
    expect(findBailoutPoints(r, [place('Far', 41.1, -70.0, 'marina')], 15)).toHaveLength(0);
  });

  // DestinationType only admits marina, anchorage, mooring, yacht-club and town-dock, so
  // the isProtected filter inside findBailoutPoints cannot reject anything. Documented
  // here rather than removed: if a type like 'landmark' is ever added, this pins the
  // expectation that shelter filtering has to start working.
  it('accepts every destination type the model currently allows', () => {
    const types = ['marina', 'anchorage', 'mooring', 'yacht-club', 'town-dock'] as const;
    for (const type of types) {
      expect(findBailoutPoints(r, [place(type, 41.1, -72.45, type)])).toHaveLength(1);
    }
  });

  it('reports when along the voyage each one is closest', () => {
    const bailouts = findBailoutPoints(r, [
      place('Near start', 41.02, -72.5, 'marina'),
      place('Near end', 41.18, -72.5, 'marina'),
    ]);
    const start = bailouts.find((b) => b.destination.id === 'Near start')!;
    const end = bailouts.find((b) => b.destination.id === 'Near end')!;
    expect(start.hoursIntoVoyage).toBeLessThan(end.hoursIntoVoyage);
  });

  it('orders by when they are reachable', () => {
    const bailouts = findBailoutPoints(r, [
      place('Near end', 41.18, -72.5, 'marina'),
      place('Near start', 41.02, -72.5, 'marina'),
    ]);
    const hours = bailouts.map((b) => b.hoursIntoVoyage);
    expect(hours).toEqual([...hours].sort((a, b) => a - b));
  });

  it('derives divert time from distance and cruising speed', () => {
    const bailouts = findBailoutPoints(r, [place('Off', 41.1, -72.36, 'marina')]);
    const b = bailouts[0];
    expect(b.divertTimeHours).toBeCloseTo(b.distanceFromRouteNM / r.expectedSpeedKnots, 5);
  });

  it('returns nothing for a route with fewer than two waypoints', () => {
    expect(findBailoutPoints({ ...r, waypoints: [r.waypoints[0]] }, [])).toEqual([]);
  });

  it('survives a route with a zero cruising speed rather than dividing by it', () => {
    const stopped = { ...r, expectedSpeedKnots: 0 };
    const bailouts = findBailoutPoints(stopped, [place('Close', 41.1, -72.45, 'anchorage')]);
    expect(bailouts.every((b) => Number.isFinite(b.divertTimeHours))).toBe(true);
  });

  it('does not report the same harbour twice', () => {
    const duplicate = place('Close', 41.1, -72.45, 'anchorage');
    const bailouts = findBailoutPoints(r, [duplicate, { ...duplicate }]);
    expect(bailouts).toHaveLength(1);
  });
});

describe('divert times are costed against the current', () => {
  const r = route();
  const harbour = place('Refuge', 41.1, -72.36, 'marina'); // roughly due east of the track
  const DEPART = Date.UTC(2026, 7, 17, 12, 0);

  function bailoutWith(speedKnots: number, directionDeg: number) {
    return findBailoutPoints(r, [harbour], 15, {
      departureTimeMs: DEPART,
      currentLookup: () => ({ speedKnots, directionDeg }),
    })[0];
  }

  it('falls back to cruising speed when no current is known, and says so', () => {
    const b = findBailoutPoints(r, [harbour])[0];
    expect(b.currentAlongDivertKn).toBeNull();
    expect(b.divertSpeedKn).toBe(r.expectedSpeedKnots);
  });

  it('a fair current shortens the divert', () => {
    const fair = bailoutWith(2, 90); // setting the way we are going
    const still = findBailoutPoints(r, [harbour])[0];
    expect(fair.currentAlongDivertKn!).toBeGreaterThan(0);
    expect(fair.divertTimeHours).toBeLessThan(still.divertTimeHours);
  });

  // The case that matters: an emergency divert into a foul stream.
  it('a foul current lengthens the divert', () => {
    const foul = bailoutWith(2.5, 270); // setting against us
    const still = findBailoutPoints(r, [harbour])[0];
    expect(foul.currentAlongDivertKn!).toBeLessThan(0);
    expect(foul.divertTimeHours).toBeGreaterThan(still.divertTimeHours);
  });

  it('a 2.5 kt foul stream nearly doubles the time, which is the point', () => {
    const foul = bailoutWith(2.5, 270);
    const still = findBailoutPoints(r, [harbour])[0];
    expect(foul.divertTimeHours / still.divertTimeHours).toBeGreaterThan(1.6);
  });

  it('a cross-setting current barely changes it', () => {
    const across = bailoutWith(2.5, 0);
    const still = findBailoutPoints(r, [harbour])[0];
    expect(Math.abs(across.divertTimeHours - still.divertTimeHours)).toBeLessThan(0.05);
  });

  it('an overwhelming foul stream gives a long but finite divert, never negative', () => {
    const overwhelming = bailoutWith(20, 270);
    expect(Number.isFinite(overwhelming.divertTimeHours)).toBe(true);
    expect(overwhelming.divertTimeHours).toBeGreaterThan(0);
    expect(overwhelming.divertSpeedKn).toBeGreaterThan(0);
  });

  it('reports the bearing the divert is on', () => {
    const b = findBailoutPoints(r, [harbour])[0];
    expect(b.divertBearingDeg).toBeGreaterThan(45);
    expect(b.divertBearingDeg).toBeLessThan(135);
  });
});
