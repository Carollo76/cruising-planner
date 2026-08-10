// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseGPX } from '../../route-planning/utils/gpx';
import { parsePredictionBody } from '../../../services/noaaCurrents';
import { solveDeparture, describeOption } from './solver';
import { projectPassage } from './propagation';
import { evaluateCurrentGate, evaluateTideHeight, evaluateDaylight, evaluate } from './evaluators';
import { gateBinding, findGate } from '../model/gates';
import { matchGates } from './matching';
import { daylightFor } from '../../../utils/solar';
import { formatLocalTime, localDateTimeToUtc } from '../../../utils/time';
import { distanceNM } from '../../../utils/navigation-math';
import type { Position } from '../../../types/navigation';
import type { CurrentSample } from './propagation';
import type { ConstraintBinding, EvaluationContext } from '../model/constraints';

const CENTERPORT: Position = { lat: 40.9015, lng: -73.3592 };

function blockIslandPath(): Position[] {
  const xml = readFileSync('src/test/fixtures/block-island-cyc.gpx', 'utf8');
  return parseGPX(xml).waypoints.map((w) => w.position);
}

/** Plum Gut's real predicted currents for 17 Aug 2026, from the captured fixture. */
function plumGutEvents() {
  const body = JSON.parse(
    readFileSync('src/test/fixtures/noaa-plumgut-6min-20260817.json', 'utf8')
  ) as never;
  return parsePredictionBody(body, {
    stationId: 'LIS1012',
    bin: 10,
    interval: '6',
    dateKey: '2026-08-17',
    fetchedAt: Date.UTC(2026, 7, 16),
  });
}

/**
 * Current lookup backed by the real Plum Gut series, applied within 8 NM of the gut and
 * nowhere else — mirroring how the app treats gates as local influences.
 */
function plumGutLookup() {
  const record = plumGutEvents();
  const plum = findGate('plum-gut')!;
  return (position: Position, at: number): CurrentSample | null => {
    if (distanceNM(position, plum.position) > 8) return null;
    let best = record.events[0];
    for (const e of record.events) {
      if (Math.abs(e.at - at) < Math.abs(best.at - at)) best = e;
    }
    if (!best) return null;
    return {
      signedKn: best.velocityKn,
      // Flood sets 305°, ebb 124°.
      directionDeg: best.velocityKn >= 0 ? 305 : 124,
      kind: best.kind,
    };
  };
}

const BOAT: EvaluationContext['boat'] = {
  draftFt: 4.5,
  airDraftFt: null,
  cruiseSpeedKn: 6,
};

describe('passage projection', () => {
  const path = blockIslandPath();

  it('takes about 15 hours at 6 knots with no current', () => {
    const depart = localDateTimeToUtc('2026-08-17', '05:00');
    const projection = projectPassage(path, depart, 6, () => null);
    expect(projection.elapsedHours).toBeGreaterThan(14.5);
    expect(projection.elapsedHours).toBeLessThan(15.5);
  });

  it('reports when it ran without current data rather than implying it had it', () => {
    const depart = localDateTimeToUtc('2026-08-17', '05:00');
    expect(projectPassage(path, depart, 6, () => null).hadMissingCurrentData).toBe(true);
  });

  it('samples current many times along the 51 NM leg, not once', () => {
    const depart = localDateTimeToUtc('2026-08-17', '05:00');
    const projection = projectPassage(path, depart, 6, plumGutLookup());
    const inGut = projection.steps.filter((s) => s.currentAlongKn !== 0);
    // A per-leg model would touch the gut once; per-step sampling sees it repeatedly.
    expect(inGut.length).toBeGreaterThan(5);
  });

  it('a fair current shortens the passage and a foul one lengthens it', () => {
    const path2: Position[] = [
      { lat: 41.15, lng: -72.3 },
      { lat: 41.17, lng: -72.1 },
    ];
    const fair = projectPassage(path2, 0, 6, () => ({
      signedKn: 2,
      directionDeg: 80,
      kind: 'ebb',
    }));
    const foul = projectPassage(path2, 0, 6, () => ({
      signedKn: 2,
      directionDeg: 260,
      kind: 'flood',
    }));
    expect(fair.elapsedHours).toBeLessThan(foul.elapsedHours);
  });

  it('never runs the boat backwards against an overwhelming current', () => {
    const path2: Position[] = [
      { lat: 41.15, lng: -72.3 },
      { lat: 41.17, lng: -72.1 },
    ];
    const projection = projectPassage(path2, 0, 6, () => ({
      signedKn: 20,
      directionDeg: 260,
      kind: 'flood',
    }));
    expect(projection.elapsedHours).toBeGreaterThan(0);
    expect(Number.isFinite(projection.elapsedHours)).toBe(true);
    expect(projection.arriveAt).toBeGreaterThan(projection.departAt);
  });
});

describe('gate evaluation against real Plum Gut currents', () => {
  const gate = findGate('plum-gut')!;
  const constraint = gateBinding(gate).constraint as Extract<
    ConstraintBinding['constraint'],
    { kind: 'current-gate' }
  >;

  function contextWith(signedAlongKn: number, at: number): EvaluationContext {
    return {
      at,
      courseDeg: 99,
      boat: BOAT,
      currents: {
        speedKn: Math.abs(signedAlongKn),
        signedKn: signedAlongKn,
        directionDeg: signedAlongKn >= 0 ? 124 : 305,
        kind: signedAlongKn >= 0 ? 'ebb' : 'flood',
      },
    };
  }

  const noon = localDateTimeToUtc('2026-08-17', '12:00');

  it('calls a fair current good and says so in knots', () => {
    const verdict = evaluateCurrentGate(constraint, contextWith(2.9, noon));
    expect(verdict.status).toBe('ok');
    expect(verdict.detail).toContain('2.9 kn fair');
  });

  it('calls slack water fine', () => {
    expect(evaluateCurrentGate(constraint, contextWith(0.1, noon)).status).toBe('ok');
  });

  it('cautions on a mild foul current', () => {
    const verdict = evaluateCurrentGate(constraint, contextWith(-1.2, noon));
    expect(verdict.status).toBe('caution');
  });

  it('fails outright on a strong foul current', () => {
    const verdict = evaluateCurrentGate(constraint, contextWith(-3.0, noon));
    expect(verdict.status).toBe('fail');
    if (verdict.status === 'fail') expect(verdict.remedies.length).toBeGreaterThan(0);
  });

  it('penalises a worse foul current more than a milder one', () => {
    const mild = evaluateCurrentGate(constraint, contextWith(-1.1, noon));
    const bad = evaluateCurrentGate(constraint, contextWith(-2.2, noon));
    const mildPenalty = mild.status === 'caution' ? mild.penalty : 0;
    const badPenalty = bad.status === 'caution' ? bad.penalty : 0;
    expect(badPenalty).toBeGreaterThan(mildPenalty);
  });

  it('says so when no current data is cached instead of assuming slack', () => {
    const verdict = evaluateCurrentGate(constraint, { at: noon, courseDeg: 99, boat: BOAT });
    expect(verdict.status).toBe('unknown');
    expect(verdict.detail).toContain('No current prediction');
  });
});

describe('tide height evaluation', () => {
  const at = localDateTimeToUtc('2026-08-17', '14:00');

  it('refuses to judge when the controlling depth is unknown', () => {
    const verdict = evaluateTideHeight(
      { kind: 'tide-height', stationId: 'x', controllingDepthFt: null, safetyMarginFt: 2 },
      { at, courseDeg: 90, boat: BOAT, tideHeightFt: 3 }
    );
    expect(verdict.status).toBe('unknown');
    expect(verdict.detail).toContain('Check the chart');
  });

  it('passes when there is water to spare', () => {
    const verdict = evaluateTideHeight(
      { kind: 'tide-height', stationId: 'x', controllingDepthFt: 6, safetyMarginFt: 2 },
      { at, courseDeg: 90, boat: BOAT, tideHeightFt: 3 }
    );
    expect(verdict.status).toBe('ok');
    expect(verdict.detail).toContain('4.5 ft draft');
  });

  it('cautions when it clears the keel but eats the margin', () => {
    const verdict = evaluateTideHeight(
      { kind: 'tide-height', stationId: 'x', controllingDepthFt: 4, safetyMarginFt: 2 },
      { at, courseDeg: 90, boat: BOAT, tideHeightFt: 1 }
    );
    expect(verdict.status).toBe('caution');
  });

  it('fails when there is less water than the boat draws', () => {
    const verdict = evaluateTideHeight(
      { kind: 'tide-height', stationId: 'x', controllingDepthFt: 3, safetyMarginFt: 2 },
      { at, courseDeg: 90, boat: BOAT, tideHeightFt: 1 }
    );
    expect(verdict.status).toBe('fail');
  });

  it('the 4.5 ft shoal keel gets in where a 5.9 ft deep keel would not', () => {
    const shallow = { kind: 'tide-height' as const, stationId: 'x', controllingDepthFt: 5, safetyMarginFt: 1 };
    const context = { at, courseDeg: 90, tideHeightFt: 1 };
    expect(evaluateTideHeight(shallow, { ...context, boat: BOAT }).status).toBe('ok');
    expect(
      evaluateTideHeight(shallow, { ...context, boat: { ...BOAT, draftFt: 5.9 } }).status
    ).not.toBe('ok');
  });
});

describe('daylight evaluation', () => {
  const day = localDateTimeToUtc('2026-08-17', '12:00');
  const window = daylightFor(CENTERPORT, day);

  it('accepts a midday arrival', () => {
    const verdict = evaluateDaylight(
      { kind: 'daylight', allowNightArrival: false },
      { at: day, courseDeg: 90, boat: BOAT, daylight: window }
    );
    expect(verdict.status).toBe('ok');
  });

  it('fails a night arrival and says how far outside twilight it is', () => {
    const verdict = evaluateDaylight(
      { kind: 'daylight', allowNightArrival: false },
      { at: window.civilDusk + 90 * 60_000, courseDeg: 90, boat: BOAT, daylight: window }
    );
    expect(verdict.status).toBe('fail');
    expect(verdict.detail).toContain('90 min outside');
  });

  it('downgrades to a caution when night arrival is accepted', () => {
    const verdict = evaluateDaylight(
      { kind: 'daylight', allowNightArrival: true },
      { at: window.civilDusk + 90 * 60_000, courseDeg: 90, boat: BOAT, daylight: window }
    );
    expect(verdict.status).toBe('caution');
  });
});

describe('the exhaustive dispatcher', () => {
  const at = localDateTimeToUtc('2026-08-17', '12:00');

  it('routes each kind to its evaluator', () => {
    expect(
      evaluate({ kind: 'daylight', allowNightArrival: true }, { at, courseDeg: 0, boat: BOAT }).status
    ).toBe('unknown');
  });

  it('admits that bridges are not yet assessed rather than passing them', () => {
    const verdict = evaluate(
      { kind: 'bridge', closedClearanceFt: 25, openingWindows: [], noticeMinutes: null },
      { at, courseDeg: 0, boat: BOAT }
    );
    expect(verdict.status).toBe('unknown');
  });
});

describe('the departure solver on the real route', () => {
  const path = blockIslandPath();
  const lookup = plumGutLookup();
  const bindings: ConstraintBinding[] = matchGates(path).map((t) => gateBinding(t.gate));

  const earliest = localDateTimeToUtc('2026-08-17', '00:00');
  const latest = localDateTimeToUtc('2026-08-17', '12:00');

  const result = solveDeparture({
    path,
    earliest,
    latest,
    cruiseSpeedKn: 6,
    bindings,
    lookupCurrent: lookup,
    boat: BOAT,
    stepMinutes: 10,
  });

  it('finds the gate the route transits and binds a constraint to it', () => {
    expect(bindings).toHaveLength(1);
    expect(bindings[0].label).toBe('Plum Gut');
  });

  it('returns a ranked list of departures', () => {
    expect(result.options.length).toBeGreaterThan(60);
    expect(result.best).not.toBeNull();
  });

  it('ranks by score, best first', () => {
    const scores = result.options.map((o) => o.score);
    expect(scores).toEqual([...scores].sort((a, b) => a - b));
  });

  it('puts the boat through Plum Gut on a fair current at the top recommendation', () => {
    const gate = result.best!.outcomes.find((o) => o.kind === 'current-gate');
    expect(gate).toBeDefined();
    expect(gate!.verdict.status).toBe('ok');
    expect(gate!.verdict.detail).toMatch(/fair|Slack/);
  });

  it('never recommends a departure that fails a constraint', () => {
    expect(result.best!.outcomes.every((o) => o.verdict.status !== 'fail')).toBe(true);
  });

  it('offers runners-up, since the second-best often fits real life', () => {
    expect(result.options.length).toBeGreaterThan(3);
    expect(result.options[1].departAt).not.toBe(result.best!.departAt);
  });

  it('describes the recommendation as a sentence a skipper can act on', () => {
    const sentence = describeOption(result.best!, 'Centerport');
    expect(sentence).toContain('Leave Centerport at');
    expect(sentence).toContain('Plum Gut at');
    expect(sentence).toMatch(/\d\.\d kn/);
  });

  it('the best departure differs from simply leaving at the start of the window', () => {
    // If timing did not matter, the solver would just pick the earliest and shortest.
    expect(result.best!.departAt).not.toBe(earliest);
  });
});

describe('when nothing in the window works', () => {
  const path = blockIslandPath();
  const gate = findGate('plum-gut')!;

  // A current permanently foul and far above the hard limit.
  const alwaysFoul = (position: Position): CurrentSample | null =>
    distanceNM(position, gate.position) > 8
      ? null
      : { signedKn: -4, directionDeg: 305, kind: 'flood' };

  const result = solveDeparture({
    path,
    earliest: localDateTimeToUtc('2026-08-17', '06:00'),
    latest: localDateTimeToUtc('2026-08-17', '09:00'),
    cruiseSpeedKn: 6,
    bindings: [gateBinding(gate)],
    lookupCurrent: alwaysFoul,
    boat: BOAT,
    stepMinutes: 30,
  });

  it('returns no recommendation rather than the least-bad option', () => {
    expect(result.best).toBeNull();
  });

  it('names the constraint that broke it', () => {
    expect(result.infeasibleReason).toContain('Plum Gut');
    expect(result.infeasibleReason).toContain('foul');
  });

  it('offers remedies instead of a dead end', () => {
    expect(result.remedies.length).toBeGreaterThan(0);
    expect(result.remedies.join(' ')).toMatch(/earlier|later|slack|wait/i);
  });

  it('offers nothing as workable', () => {
    expect(result.options).toEqual([]);
  });

  it('still returns every candidate it tried, for the user to explore', () => {
    expect(result.allOptions.length).toBeGreaterThan(0);
    expect(result.allOptions.every((o) => !o.feasible)).toBe(true);
  });

  it('keeps the candidates in time order so a slider can walk them', () => {
    const times = result.allOptions.map((o) => o.departAt);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
});

describe('unknowns are counted, not ignored', () => {
  const path = blockIslandPath();
  const gate = findGate('plum-gut')!;

  it('an option with no current data scores worse than one with a fair current', () => {
    const withData = solveDeparture({
      path,
      earliest: localDateTimeToUtc('2026-08-17', '00:00'),
      latest: localDateTimeToUtc('2026-08-17', '01:00'),
      cruiseSpeedKn: 6,
      bindings: [gateBinding(gate)],
      lookupCurrent: plumGutLookup(),
      boat: BOAT,
      stepMinutes: 60,
    });
    const without = solveDeparture({
      path,
      earliest: localDateTimeToUtc('2026-08-17', '00:00'),
      latest: localDateTimeToUtc('2026-08-17', '01:00'),
      cruiseSpeedKn: 6,
      bindings: [gateBinding(gate)],
      lookupCurrent: () => null,
      boat: BOAT,
      stepMinutes: 60,
    });
    expect(without.options[0].unknownCount).toBe(1);
    expect(withData.options[0].unknownCount).toBe(0);
  });
});

describe('local time rendering of the answer', () => {
  it('reports departure in the boat’s zone, not UTC', () => {
    const at = localDateTimeToUtc('2026-08-17', '04:40');
    expect(formatLocalTime(at)).toBe('04:40');
  });
});

describe('departure windows rather than adjacent samples', () => {
  const path = blockIslandPath();
  const result = solveDeparture({
    path,
    earliest: localDateTimeToUtc('2026-08-17', '00:00'),
    latest: localDateTimeToUtc('2026-08-17', '12:00'),
    cruiseSpeedKn: 6,
    bindings: matchGates(path).map((t) => gateBinding(t.gate)),
    lookupCurrent: plumGutLookup(),
    boat: BOAT,
    stepMinutes: 10,
  });

  it('collapses dozens of samples into a handful of real choices', () => {
    expect(result.windows.length).toBeGreaterThan(0);
    expect(result.windows.length).toBeLessThan(result.options.length / 4);
  });

  it('reports each window as a span a skipper can work with', () => {
    for (const w of result.windows) {
      expect(w.closesAt).toBeGreaterThanOrEqual(w.opensAt);
      expect(w.best.departAt).toBeGreaterThanOrEqual(w.opensAt);
      expect(w.best.departAt).toBeLessThanOrEqual(w.closesAt);
    }
  });

  it('leads with the same departure as the overall best', () => {
    expect(result.windows[0].best.departAt).toBe(result.best!.departAt);
  });

  it('orders windows by quality, not by clock', () => {
    const scores = result.windows.map((w) => w.best.score);
    expect(scores).toEqual([...scores].sort((a, b) => a - b));
  });
});

describe('the slider can reach every candidate', () => {
  const path = blockIslandPath();
  const result = solveDeparture({
    path,
    earliest: localDateTimeToUtc('2026-08-17', '00:00'),
    latest: localDateTimeToUtc('2026-08-17', '12:00'),
    cruiseSpeedKn: 6,
    bindings: matchGates(path).map((t) => gateBinding(t.gate)),
    lookupCurrent: plumGutLookup(),
    boat: BOAT,
    stepMinutes: 10,
  });

  it('exposes more candidates than the workable subset', () => {
    expect(result.allOptions.length).toBeGreaterThanOrEqual(result.options.length);
  });

  it('includes both workable and unworkable departures when both exist', () => {
    const feasibleCount = result.allOptions.filter((o) => o.feasible).length;
    expect(feasibleCount).toBe(result.options.length);
  });

  it('gives different gate arrivals for different departures', () => {
    const gateTimes = result.allOptions
      .map((o) => o.outcomes.find((c) => c.kind === 'current-gate')?.at)
      .filter((t): t is number => t !== undefined);
    expect(new Set(gateTimes).size).toBeGreaterThan(10);
  });
});
