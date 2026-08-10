import { describe, it, expect } from 'vitest';
import { positionAtHour, assessHourForTest } from './assessment-engine';
import { DEFAULT_THRESHOLDS } from '../../../constants/weather-thresholds';
import type { Route, Waypoint } from '../../../types/navigation';

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
