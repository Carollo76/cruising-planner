// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseGPX } from '../features/route-planning/utils/gpx';
import {
  LI_SOUND_CURRENT_STATIONS,
  findRelevantCurrentStations,
  findCurrentAtTime,
  findNextSlackWater,
  type CurrentPrediction,
} from './noaa-currents';
import { distanceNM } from '../utils/navigation-math';
import type { Position } from '../types/navigation';

/**
 * These cover the defects the Go/No-Go engine had been running with. The station IDs and
 * the matching rule are the parts that were silently wrong, so they are what is asserted.
 */

function blockIslandPath(): Position[] {
  const xml = readFileSync('src/test/fixtures/block-island-cyc.gpx', 'utf8');
  return parseGPX(xml).waypoints.map((w) => w.position);
}

describe('station registry', () => {
  it('uses the real current-prediction station for The Race', () => {
    const race = LI_SOUND_CURRENT_STATIONS.find((s) => s.name === 'The Race')!;
    expect(race.id).toBe('LIS1001');
    expect(race.id).not.toBe('ACT4531'); // the id the engine used to query
  });

  it('uses the real current-prediction station for Plum Gut', () => {
    const plum = LI_SOUND_CURRENT_STATIONS.find((s) => s.name === 'Plum Gut')!;
    expect(plum.id).toBe('LIS1012');
    expect(plum.id).not.toBe('ACT4576');
  });

  it('uses the real station for Hell Gate', () => {
    const hell = LI_SOUND_CURRENT_STATIONS.find((s) => s.name === 'Hell Gate')!;
    expect(hell.id).toBe('NYH1924');
    expect(hell.id).not.toBe('ACT3876');
  });

  it('every station names a depth bin, so the surface bin is explicit', () => {
    for (const station of LI_SOUND_CURRENT_STATIONS) {
      expect(station.bin).toBeGreaterThanOrEqual(1);
    }
  });

  it('marks the three passages that are dangerous, not merely slow', () => {
    const critical = LI_SOUND_CURRENT_STATIONS.filter((s) => s.critical).map((s) => s.name);
    expect(critical).toContain('The Race');
    expect(critical).toContain('Plum Gut');
    expect(critical).toContain('Hell Gate');
  });
});

describe('matching stations to a route', () => {
  const path = blockIslandPath();

  it('finds the station the route actually passes', () => {
    const found = findRelevantCurrentStations(path, 5).map((s) => s.name);
    expect(found).toContain('Plum Gut');
  });

  // The defect: waypoint-only matching missed The Race by a wide margin.
  it('finds The Race, which waypoint-only matching missed entirely', () => {
    const race = LI_SOUND_CURRENT_STATIONS.find((s) => s.name === 'The Race')!;
    const nearestWaypoint = Math.min(
      ...path.map((p) => distanceNM({ lat: race.lat, lng: race.lng }, p))
    );
    expect(nearestWaypoint).toBeGreaterThan(7); // outside the 5 NM the engine searched

    const found = findRelevantCurrentStations(path, 5);
    expect(found.map((s) => s.name)).toContain('The Race');
    expect(found.find((s) => s.name === 'The Race')!.distanceFromRouteNM).toBeLessThan(4);
  });

  it('ignores stations far from the track', () => {
    const found = findRelevantCurrentStations(path, 5).map((s) => s.name);
    expect(found).not.toContain('Hell Gate');
    expect(found).not.toContain('Throgs Neck Bridge');
  });

  it('orders by closest approach', () => {
    const distances = findRelevantCurrentStations(path, 8).map((s) => s.distanceFromRouteNM);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
  });

  it('returns nothing for a route with fewer than two waypoints', () => {
    expect(findRelevantCurrentStations([{ lat: 41, lng: -72 }], 5)).toEqual([]);
  });
});

describe('reading a prediction series', () => {
  const base = Date.UTC(2026, 7, 17, 12, 0);
  const prediction: CurrentPrediction = {
    stationId: 'LIS1012',
    stationName: 'Plum Gut',
    fetchedAt: base,
    data: [
      { timestamp: base, speedKnots: 2, directionDeg: 305, absSpeedKnots: 2, type: 'flood' },
      { timestamp: base + 3_600_000, speedKnots: 0, directionDeg: 305, absSpeedKnots: 0, type: 'slack' },
      { timestamp: base + 7_200_000, speedKnots: -2, directionDeg: 124, absSpeedKnots: 2, type: 'ebb' },
    ],
  };

  it('finds the closest sample', () => {
    expect(findCurrentAtTime(prediction, base + 3_500_000)?.type).toBe('slack');
  });

  // The old version returned the nearest sample no matter how distant, which meant a
  // request outside the fetched range got the current from a completely different tide.
  it('returns nothing when the series does not reach the requested time', () => {
    expect(findCurrentAtTime(prediction, base + 20 * 3_600_000)).toBeNull();
  });

  it('carries a real heading, not a bin index', () => {
    const point = findCurrentAtTime(prediction, base)!;
    expect(point.directionDeg).toBe(305);
    // The bug: direction used to come from the Bin field, so it was 1, 7 or 10.
    expect(point.directionDeg).toBeGreaterThan(20);
  });

  it('finds the next slack', () => {
    expect(findNextSlackWater(prediction, base)?.timestamp).toBe(base + 3_600_000);
  });

  it('returns nothing when no slack follows', () => {
    expect(findNextSlackWater(prediction, base + 8_000_000)).toBeNull();
  });
});

describe('bins point at the water the keel is in', () => {
  // NOAA numbers bins bottom-up, so bin 1 is the deepest reading — 158 ft at Plum Gut,
  // 45 ft at The Race. Every gate had been reading its deepest bin, which understated
  // the current the boat actually meets, in the flattering direction.
  const expected: Record<string, number> = {
    'The Race': 13,
    'Plum Gut': 21,
    'Hell Gate': 9,
    'Throgs Neck Bridge': 15,
  };

  it('uses the shallowest published bin at every station', () => {
    for (const station of LI_SOUND_CURRENT_STATIONS) {
      expect(station.bin).toBe(expected[station.name]);
    }
  });

  it('no station is left on bin 1, which is the deepest', () => {
    expect(LI_SOUND_CURRENT_STATIONS.every((s) => s.bin !== 1)).toBe(true);
  });
});
