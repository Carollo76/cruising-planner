// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseGPX } from '../../route-planning/utils/gpx';
import {
  matchGates,
  nearbyGates,
  classifySense,
  favourablePhase,
  checkFavourableAgreement,
} from './matching';
import { findGate, TIDAL_GATES } from '../model/gates';
import {
  closestApproachToSegment,
  alongTrackCurrentKn,
  subdivideLeg,
  angularDifference,
} from '../../../utils/route-geometry';
import { distanceNM } from '../../../utils/navigation-math';
import type { Position } from '../../../types/navigation';

/** The owner's real Navionics export: Centerport Yacht Club to Block Island. */
function blockIslandRoute(): { name: string; path: Position[] } {
  const xml = readFileSync('src/test/fixtures/block-island-cyc.gpx', 'utf8');
  const { name, waypoints } = parseGPX(xml);
  return { name, path: waypoints.map((w) => w.position) };
}

describe('the real Block Island route', () => {
  const { name, path } = blockIslandRoute();

  it('parses through the app’s own GPX reader', () => {
    expect(name).toContain('Block Island');
    expect(path).toHaveLength(45);
  });

  it('runs from Centerport to Block Island', () => {
    expect(path[0].lat).toBeCloseTo(40.9012, 3);
    expect(path[0].lng).toBeCloseTo(-73.3596, 3);
    expect(path[path.length - 1].lat).toBeCloseTo(41.1937, 3);
    expect(path[path.length - 1].lng).toBeCloseTo(-71.5811, 3);
  });

  it('is about 90 NM', () => {
    const total = path.slice(1).reduce((sum, p, i) => sum + distanceNM(path[i], p), 0);
    expect(total).toBeGreaterThan(88);
    expect(total).toBeLessThan(92);
  });

  // Acceptance criterion 1, adjusted: the spec expects Plum Gut *and* The Race, but §9
  // states they are alternative doors out of the Sound. This route takes the southern
  // one, so the correct answer is Plum Gut alone — reporting The Race would be a transit
  // that never happens.
  it('detects Plum Gut as the gate actually transited', () => {
    const transits = matchGates(path);
    expect(transits.map((t) => t.gate.id)).toEqual(['plum-gut']);
  });

  it('passes within a third of a mile of Plum Gut', () => {
    const [plum] = matchGates(path);
    expect(plum.offsetNm).toBeLessThan(0.5);
  });

  it('places the transit well down the route', () => {
    const [plum] = matchGates(path);
    expect(plum.routeDistanceNm).toBeGreaterThan(55);
    expect(plum.routeDistanceNm).toBeLessThan(70);
  });

  it('goes through heading roughly east', () => {
    const [plum] = matchGates(path);
    expect(plum.courseDeg).toBeGreaterThan(60);
    expect(plum.courseDeg).toBeLessThan(130);
  });

  it('reports The Race as near the track but not transited', () => {
    const near = nearbyGates(path);
    const race = near.find((t) => t.gate.id === 'the-race');
    expect(race).toBeDefined();
    expect(race!.offsetNm).toBeGreaterThan(3);
    expect(race!.offsetNm).toBeLessThan(4);
  });

  it('does not match the western gates at all', () => {
    const ids = [...matchGates(path), ...nearbyGates(path)].map((t) => t.gate.id);
    expect(ids).not.toContain('hell-gate');
    expect(ids).not.toContain('throgs-neck');
  });

  // The failure this design exists to prevent.
  it('would miss The Race entirely if matching used waypoints instead of the track', () => {
    const race = findGate('the-race')!;
    const nearestWaypoint = Math.min(...path.map((p) => distanceNM(race.position, p)));
    const nearestOnTrack = Math.min(
      ...path.slice(1).map((p, i) => closestApproachToSegment(race.position, path[i], p).distanceNm)
    );
    expect(nearestWaypoint).toBeGreaterThan(7);
    expect(nearestOnTrack).toBeLessThan(3.5);
  });

  it('has legs long enough that a single current sample would be wrong', () => {
    const legs = path.slice(1).map((p, i) => distanceNM(path[i], p));
    const longest = Math.max(...legs);
    expect(longest).toBeGreaterThan(50);
    // Over eight hours at cruise speed — the current reverses inside one leg.
    expect(longest / 6).toBeGreaterThan(8);
  });
});

describe('transit sense from the station’s own axis', () => {
  // The Race: flood 292°, ebb 108°.
  it('reads an easterly course as running with the ebb', () => {
    expect(classifySense(99, 108)).toBe('eastbound');
  });

  it('reads a westerly course as running against it', () => {
    expect(classifySense(280, 108)).toBe('westbound');
  });

  it('picks ebb as favourable heading east through The Race', () => {
    expect(favourablePhase(99, 292, 108)).toBe('ebb');
  });

  it('picks flood as favourable heading west through The Race', () => {
    expect(favourablePhase(285, 292, 108)).toBe('flood');
  });

  it('picks ebb heading east through Plum Gut, whose axis differs', () => {
    // Plum Gut: flood 305°, ebb 124°.
    expect(favourablePhase(99, 305, 124)).toBe('ebb');
  });
});

describe('configured expectations are only a cross-check', () => {
  it('stays silent when derived and configured agree', () => {
    const race = findGate('the-race')!;
    expect(checkFavourableAgreement(race, 'eastbound', 'ebb')).toBeNull();
  });

  it('reports disagreement rather than trusting either silently', () => {
    const race = findGate('the-race')!;
    const warning = checkFavourableAgreement(race, 'eastbound', 'flood');
    expect(warning).toContain('disagrees');
    expect(warning).toContain('The Race');
  });

  it('every registry entry expects opposite phases in opposite directions', () => {
    for (const gate of TIDAL_GATES) {
      expect(gate.expectedFavourable.eastbound).not.toBe(gate.expectedFavourable.westbound);
    }
  });
});

describe('along-track current projection', () => {
  it('gives full strength when the current runs with the course', () => {
    expect(alongTrackCurrentKn(3, 90, 90)).toBeCloseTo(3, 6);
  });

  it('gives full negative strength dead against', () => {
    expect(alongTrackCurrentKn(3, 270, 90)).toBeCloseTo(-3, 6);
  });

  it('gives nothing when the current sets across the course', () => {
    expect(alongTrackCurrentKn(3, 180, 90)).toBeCloseTo(0, 6);
  });

  it('projects a partial component at 60 degrees off', () => {
    expect(alongTrackCurrentKn(2, 150, 90)).toBeCloseTo(1, 6);
  });

  it('a 3 kn ebb on a 99 degree course through Plum Gut mostly helps', () => {
    // Ebb sets 124°; boat steering 099°.
    expect(alongTrackCurrentKn(3, 124, 99)).toBeGreaterThan(2.7);
  });
});

describe('leg subdivision', () => {
  const from = { lat: 41.16, lng: -72.2 };
  const to = { lat: 41.2, lng: -71.59 };

  it('splits a long leg into steps no longer than asked', () => {
    const points = subdivideLeg(from, to, 2);
    for (let i = 1; i < points.length; i++) {
      expect(distanceNM(points[i - 1], points[i])).toBeLessThanOrEqual(2.01);
    }
  });

  it('keeps the endpoints exactly', () => {
    const points = subdivideLeg(from, to, 2);
    expect(distanceNM(points[0], from)).toBeLessThan(0.001);
    expect(distanceNM(points[points.length - 1], to)).toBeLessThan(0.001);
  });

  it('leaves a short leg as a single step', () => {
    const points = subdivideLeg({ lat: 41.16, lng: -72.2 }, { lat: 41.17, lng: -72.2 }, 2);
    expect(points).toHaveLength(2);
  });
});

describe('angular difference', () => {
  it('is zero for identical bearings', () => expect(angularDifference(90, 90)).toBe(0));
  it('handles the 0/360 wrap', () => expect(angularDifference(350, 10)).toBe(20));
  it('caps at 180', () => expect(angularDifference(0, 180)).toBe(180));
  it('is symmetric', () => expect(angularDifference(10, 350)).toBe(angularDifference(350, 10)));
});

describe('closest approach clamps to the segment', () => {
  const a = { lat: 41, lng: -72 };
  const b = { lat: 41, lng: -71 };

  it('measures to the start when the point lies behind it', () => {
    const behind = { lat: 41, lng: -73 };
    const approach = closestApproachToSegment(behind, a, b);
    expect(approach.alongFraction).toBe(0);
    expect(approach.distanceNm).toBeCloseTo(distanceNM(behind, a), 1);
  });

  it('measures to the end when the point lies beyond it', () => {
    const beyond = { lat: 41, lng: -70 };
    const approach = closestApproachToSegment(beyond, a, b);
    expect(approach.alongFraction).toBe(1);
    expect(approach.distanceNm).toBeCloseTo(distanceNM(beyond, b), 1);
  });

  it('finds a perpendicular offset from the middle of a segment', () => {
    const offset = { lat: 41.1, lng: -71.5 };
    const approach = closestApproachToSegment(offset, a, b);
    expect(approach.distanceNm).toBeCloseTo(6, 0); // 0.1 degree of latitude
    expect(approach.alongFraction).toBeGreaterThan(0.4);
    expect(approach.alongFraction).toBeLessThan(0.6);
  });
});
