import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  parseChartedDepths,
  shallowestNavigable,
  sourceNoteFor,
  boundingBox,
  ChartDepthError,
} from './noaaChartDepths';

const CENTERPORT = { lat: 40.90121, lng: -73.36009 };

/** Literal responses captured from NOAA's ENC Direct service. */
function fixture(name: string) {
  return JSON.parse(readFileSync(`src/test/fixtures/${name}`, 'utf8'));
}

function centerportDepths() {
  return parseChartedDepths(
    fixture('noaa-enc-soundings-centerport.json'),
    fixture('noaa-enc-deptharea-centerport.json'),
    CENTERPORT,
    0.25
  );
}

describe('parsing real charted depths', () => {
  const depths = centerportDepths();

  it('reads every sounding', () => {
    expect(depths.soundings).toHaveLength(16);
  });

  it('converts metres to feet, since the boat is measured in feet', () => {
    // Shallowest sounding in the capture is 0.8 m.
    expect(depths.soundings[0].depthFt).toBeCloseTo(2.6, 1);
  });

  it('orders soundings shallowest first, which is what matters to a keel', () => {
    const feet = depths.soundings.map((s) => s.depthFt);
    expect(feet).toEqual([...feet].sort((a, b) => a - b));
  });

  it('reads depth areas with their minimum depth', () => {
    expect(depths.depthAreas.length).toBeGreaterThan(0);
    // -2.3 m is a drying area: negative feet, and it must stay negative rather than
    // being clamped, or a mudflat would read as navigable water.
    expect(depths.depthAreas[0].minDepthFt).toBeLessThan(0);
  });

  it('records how far each sounding is from the place', () => {
    for (const s of depths.soundings) {
      expect(s.distanceNm).toBeGreaterThanOrEqual(0);
      expect(s.distanceNm).toBeLessThan(1);
    }
  });

  // The capture mixes 2021, 2015 and 1990 surveys in one small harbour. Reporting the
  // oldest is the honest summary: a skipper reading "surveyed 1990" knows to treat the
  // number as indicative, which averaging or taking the newest would have hidden.
  it('reports the oldest survey among the results, not the newest', () => {
    expect(depths.oldestSurvey).toBe('1990-01-01');
  });

  it('keeps each sounding’s own survey date, so stale ones can be spotted', () => {
    const dates = new Set(depths.soundings.map((s) => s.surveyedOn));
    expect(dates.size).toBeGreaterThan(1);
    expect(dates).toContain('2021-06-10');
    expect(dates).toContain('1990-01-01');
  });
});

describe('choosing a candidate depth', () => {
  const depths = centerportDepths();

  it('skips the drying edges and offers the shallowest navigable sounding', () => {
    const candidate = shallowestNavigable(depths)!;
    expect(candidate.depthFt).toBeGreaterThanOrEqual(1);
  });

  it('respects a higher floor when asked', () => {
    const candidate = shallowestNavigable(depths, 6)!;
    expect(candidate.depthFt).toBeGreaterThanOrEqual(6);
  });

  it('returns nothing rather than inventing one when nothing qualifies', () => {
    expect(shallowestNavigable(depths, 500)).toBeNull();
  });

  it('builds a source note that records provenance and survey date', () => {
    const note = sourceNoteFor(depths);
    expect(note).toContain('NOAA ENC');
    expect(note).toContain('1990-01-01');
  });
});

describe('search box', () => {
  it('grows with the radius', () => {
    const small = boundingBox(CENTERPORT, 0.1).split(',').map(Number);
    const large = boundingBox(CENTERPORT, 1).split(',').map(Number);
    expect(large[0]).toBeLessThan(small[0]);
    expect(large[3]).toBeGreaterThan(small[3]);
  });

  it('widens in longitude with latitude, so the box stays roughly square', () => {
    const equator = boundingBox({ lat: 0, lng: 0 }, 1).split(',').map(Number);
    const north = boundingBox({ lat: 60, lng: 0 }, 1).split(',').map(Number);
    expect(north[2] - north[0]).toBeGreaterThan(equator[2] - equator[0]);
  });
});

describe('error handling', () => {
  it('surfaces a NOAA error rather than returning empty depths', () => {
    expect(() =>
      parseChartedDepths({ error: { message: 'Invalid geometry' } }, {}, CENTERPORT, 0.25)
    ).toThrow(ChartDepthError);
  });

  it('handles an empty result without throwing', () => {
    const empty = parseChartedDepths({ features: [] }, { features: [] }, CENTERPORT, 0.25);
    expect(empty.soundings).toEqual([]);
    expect(empty.oldestSurvey).toBeNull();
    expect(shallowestNavigable(empty)).toBeNull();
  });

  it('skips features with a non-numeric depth rather than emitting NaN', () => {
    const parsed = parseChartedDepths(
      { features: [{ attributes: { Z: 'n/a' as unknown as number } }] },
      { features: [] },
      CENTERPORT,
      0.25
    );
    expect(parsed.soundings).toEqual([]);
  });
});
