import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  parsePolarCsv,
  polarSpeed,
  isRefusal,
  noGoAngle,
  windRange,
  bestUpwindVmg,
  tackingPenalty,
  type Polar,
} from './polar';
import { adviseLeg, confidenceFor, summarise, exceedsFuelRange } from './propulsion';
import { localDateTimeToUtc } from '../../../utils/time';

/** The checked-in seed polar: ORC VPP for a certificated Oceanis 37, 1.41 m shoal keel. */
function seedPolar(): Polar {
  return parsePolarCsv(readFileSync('src/data/polars/oceanis-37-shoal-1.41m.csv', 'utf8'), {
    id: 'oceanis-37-shoal',
    name: 'Oceanis 37 (shoal 1.41 m)',
    source: 'seed',
    draftMetres: 1.41,
    version: 1,
    updatedAt: 0,
  });
}

describe('parsing the seed polar', () => {
  const polar = seedPolar();

  it('reads the full TWS range from the header', () => {
    expect(polar.grid.windSpeeds).toEqual([4, 6, 8, 10, 12, 14, 16, 20, 24]);
  });

  it('reads every angle row', () => {
    expect(polar.grid.windAngles).toHaveLength(27);
    expect(polar.grid.windAngles[0]).toBeCloseTo(43.3, 1);
    expect(polar.grid.windAngles[polar.grid.windAngles.length - 1]).toBe(180);
  });

  it('keeps the provenance rather than discarding the header comments', () => {
    expect(polar.provenance).toContain('ORC certificate');
    expect(polar.provenance).toContain('HARA, GRE-1948');
    expect(polar.provenance).toContain('NOT measured from this boat');
  });

  it('records that it is a seed, so a fitted polar can supersede it later', () => {
    expect(polar.source).toBe('seed');
    expect(polar.draftMetres).toBe(1.41);
  });

  it('rejects a malformed file rather than half-reading it', () => {
    expect(() => parsePolarCsv('twa,4,6\n43.3,2.67', { ...seedPolar(), source: 'seed' })).toThrow(
      /expected 2/
    );
    expect(() => parsePolarCsv('angle,4\n43,2', { ...seedPolar(), source: 'seed' })).toThrow(/twa/);
  });
});

describe('reading speeds off the grid', () => {
  const polar = seedPolar();

  it('returns the tabulated value at an exact grid point', () => {
    // 90 degrees at 12 kn is 7.59 in the certificate.
    const result = polarSpeed(polar, 90, 12);
    expect(isRefusal(result)).toBe(false);
    if (!isRefusal(result)) expect(result.boatSpeedKn).toBeCloseTo(7.59, 2);
  });

  it('interpolates between wind speeds', () => {
    const result = polarSpeed(polar, 90, 11);
    if (isRefusal(result)) throw new Error('unexpected refusal');
    // Between 7.17 at 10 kn and 7.59 at 12 kn.
    expect(result.boatSpeedKn).toBeGreaterThan(7.17);
    expect(result.boatSpeedKn).toBeLessThan(7.59);
  });

  it('interpolates between angles', () => {
    const at60 = polarSpeed(polar, 60, 12);
    const at75 = polarSpeed(polar, 75, 12);
    const between = polarSpeed(polar, 67, 12);
    if (isRefusal(at60) || isRefusal(at75) || isRefusal(between)) throw new Error('refused');
    expect(between.boatSpeedKn).toBeGreaterThan(at60.boatSpeedKn);
    expect(between.boatSpeedKn).toBeLessThan(at75.boatSpeedKn);
  });

  it('treats the polar as symmetric about the wind', () => {
    const port = polarSpeed(polar, 90, 12);
    const starboard = polarSpeed(polar, 270, 12);
    if (isRefusal(port) || isRefusal(starboard)) throw new Error('refused');
    expect(starboard.boatSpeedKn).toBeCloseTo(port.boatSpeedKn, 6);
  });

  it('the boat is fastest on a broad reach, as a real polar should be', () => {
    const beat = polarSpeed(polar, 45, 16);
    const reach = polarSpeed(polar, 110, 16);
    const run = polarSpeed(polar, 180, 16);
    if (isRefusal(beat) || isRefusal(reach) || isRefusal(run)) throw new Error('refused');
    expect(reach.boatSpeedKn).toBeGreaterThan(beat.boatSpeedKn);
    expect(reach.boatSpeedKn).toBeGreaterThan(run.boatSpeedKn);
  });
});

// The rule that matters most: no invented numbers.
describe('refusing rather than extrapolating', () => {
  const polar = seedPolar();

  it('refuses inside the no-go angle', () => {
    const result = polarSpeed(polar, 30, 12);
    expect(isRefusal(result)).toBe(true);
    if (isRefusal(result)) {
      expect(result.reason).toBe('below-no-go');
      expect(result.detail).toContain('no-go angle');
    }
  });

  it('takes the no-go angle from the data, not a guess', () => {
    // The spec suggested "roughly 40 degrees"; this certificate says 43.3.
    expect(noGoAngle(polar)).toBeCloseTo(43.3, 1);
    expect(isRefusal(polarSpeed(polar, 42, 12))).toBe(true);
    expect(isRefusal(polarSpeed(polar, 44, 12))).toBe(false);
  });

  it('refuses below the polar’s wind floor', () => {
    const result = polarSpeed(polar, 90, 3);
    expect(isRefusal(result)).toBe(true);
    if (isRefusal(result)) expect(result.reason).toBe('wind-too-light');
  });

  it('refuses above the polar’s wind ceiling', () => {
    const result = polarSpeed(polar, 90, 30);
    expect(isRefusal(result)).toBe(true);
    if (isRefusal(result)) expect(result.reason).toBe('wind-too-strong');
  });

  it('reports the range it does cover', () => {
    expect(windRange(polar)).toEqual({ min: 4, max: 24 });
  });
});

describe('beating', () => {
  const polar = seedPolar();

  it('finds the best upwind VMG angle', () => {
    const best = bestUpwindVmg(polar, 12);
    expect(best).not.toBeNull();
    expect(best!.angleDeg).toBeGreaterThanOrEqual(43);
    expect(best!.angleDeg).toBeLessThanOrEqual(60);
    expect(best!.vmgKn).toBeGreaterThan(0);
  });

  it('costs extra distance to tack a leg', () => {
    const penalty = tackingPenalty(polar, 10, 12);
    expect(penalty).not.toBeNull();
    expect(penalty!.extraDistanceNm).toBeGreaterThan(0);
    expect(penalty!.extraTimeMin).toBeGreaterThan(0);
  });

  it('costs more in lighter air, where the boat is slower', () => {
    const light = tackingPenalty(polar, 10, 6)!;
    const breeze = tackingPenalty(polar, 10, 14)!;
    expect(light.extraTimeMin).toBeGreaterThan(breeze.extraTimeMin);
  });
});

describe('propulsion advice', () => {
  const polar = seedPolar();
  const at = localDateTimeToUtc('2026-08-17', '09:20');
  const motoring = { cruiseSpeedKn: 6, fuelGph: 1.5 };

  const baseLeg = {
    legId: 'leg-1',
    courseDeg: 90,
    distanceNm: 12,
    at,
    polar,
    motoring,
    forecastLeadDays: 1,
  };

  it('recommends sailing in a good breeze with no deadline', () => {
    const advice = adviseLeg({
      ...baseLeg,
      wind: { speedKn: 14, directionDeg: 180 },
      requiredSpeedKn: null,
      deadlineLabel: null,
    });
    expect(advice.recommendation).toBe('sail');
    expect(advice.estimatedFuelGal).toBe(0);
  });

  it('recommends motoring in light air and says why in plain words', () => {
    const advice = adviseLeg({
      ...baseLeg,
      wind: { speedKn: 3, directionDeg: 70 },
      requiredSpeedKn: null,
      deadlineLabel: null,
    });
    expect(advice.recommendation).toBe('motor');
    expect(advice.reason).toContain('wind 3 kn from 070');
    expect(advice.reason).toContain('not sailing');
  });

  it('gives the deadline as the reason when the deadline is the reason', () => {
    const advice = adviseLeg({
      ...baseLeg,
      wind: { speedKn: 6, directionDeg: 70 },
      requiredSpeedKn: 5.5,
      deadlineLabel: 'Plum Gut slack at 09:20',
    });
    expect(advice.recommendation).toMatch(/motor|motorsail/);
    expect(advice.reason).toContain('Plum Gut slack at 09:20');
    expect(advice.reason).toContain('5.5 kn');
  });

  it('recommends motorsailing when sailing gets most of the way there', () => {
    // 8 kn at 90 degrees gives about 6.4 kn; needing 7.2 leaves a 0.8 kn shortfall.
    const advice = adviseLeg({
      ...baseLeg,
      wind: { speedKn: 8, directionDeg: 180 },
      requiredSpeedKn: 7.2,
      deadlineLabel: 'The Race at 14:00',
    });
    expect(advice.recommendation).toBe('motorsail');
    expect(advice.estimatedFuelGal).toBeGreaterThan(0);
    expect(advice.estimatedFuelGal).toBeLessThan(12 / 6 * 1.5);
  });

  it('offers a tacking option when the rhumb line is inside the no-go band', () => {
    const advice = adviseLeg({
      ...baseLeg,
      courseDeg: 90,
      wind: { speedKn: 12, directionDeg: 90 }, // dead on the nose
      requiredSpeedKn: null,
      deadlineLabel: null,
    });
    expect(advice.tackingOption).toBeDefined();
    expect(advice.tackingOption!.extraDistanceNm).toBeGreaterThan(0);
    expect(advice.reason).toContain('tacking angle');
  });

  it('prefers the engine when beating would miss the deadline', () => {
    const advice = adviseLeg({
      ...baseLeg,
      wind: { speedKn: 12, directionDeg: 90 },
      requiredSpeedKn: 6,
      deadlineLabel: 'Plum Gut slack at 09:20',
    });
    expect(advice.recommendation).toBe('motor');
    expect(advice.reason).toContain('Beating would add');
    expect(advice.reason).toContain('Plum Gut slack');
  });

  it('disables advice entirely when there is no polar, rather than guessing', () => {
    const advice = adviseLeg({
      ...baseLeg,
      polar: null,
      wind: { speedKn: 12, directionDeg: 180 },
      requiredSpeedKn: null,
      deadlineLabel: null,
    });
    expect(advice.recommendation).toBe('unknown');
    expect(advice.reason).toContain('disabled rather than guessed');
    expect(advice.polarBoatSpeed).toBeNull();
  });

  it('says so when there is no wind forecast', () => {
    const advice = adviseLeg({
      ...baseLeg,
      wind: null,
      requiredSpeedKn: null,
      deadlineLabel: null,
    });
    expect(advice.recommendation).toBe('unknown');
    expect(advice.reason).toContain('No wind forecast');
  });

  it('will not pretend to advise above the polar’s ceiling', () => {
    const advice = adviseLeg({
      ...baseLeg,
      wind: { speedKn: 32, directionDeg: 180 },
      requiredSpeedKn: null,
      deadlineLabel: null,
    });
    expect(advice.recommendation).toBe('unknown');
    expect(advice.reason).toContain('Reef down');
  });
});

describe('confidence degrades with forecast lead time', () => {
  it('is high tomorrow', () => expect(confidenceFor(1)).toBe('high'));
  it('is medium at three days', () => expect(confidenceFor(3)).toBe('medium'));
  it('is low beyond three days, where a forecast is a hint', () =>
    expect(confidenceFor(5)).toBe('low'));
});

describe('summarising a passage', () => {
  const distances = new Map([
    ['a', 22],
    ['b', 9],
    ['c', 5],
  ]);
  const advice = [
    { legId: 'a', recommendation: 'sail' as const, estimatedFuelGal: 0, confidence: 'high' as const },
    { legId: 'b', recommendation: 'motor' as const, estimatedFuelGal: 2.3, confidence: 'medium' as const },
    { legId: 'c', recommendation: 'unknown' as const, estimatedFuelGal: 0.8, confidence: 'low' as const },
  ];

  const summary = summarise(advice as never, distances);

  it('splits the distance by how it is covered', () => {
    expect(summary.sailingNm).toBe(22);
    expect(summary.motoringNm).toBe(9);
  });

  it('totals the fuel', () => {
    expect(summary.fuelGal).toBeCloseTo(3.1, 5);
  });

  it('is only as confident as its worst leg', () => {
    expect(summary.confidence).toBe('low');
  });

  it('counts the legs it could not advise on', () => {
    expect(summary.unknownLegs).toBe(1);
  });

  it('flags a plan that outruns the tank', () => {
    expect(exceedsFuelRange({ ...summary, fuelGal: 40 }, 32)).toBe(true);
    expect(exceedsFuelRange(summary, 32)).toBe(false);
  });
});
