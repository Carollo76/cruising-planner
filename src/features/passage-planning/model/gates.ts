import type { Position } from '../../../types/navigation';
import type { ConstraintBinding } from './constraints';

/**
 * The named gates: passages where current dominates and where we know enough to say a
 * transit is impractical, not merely slow.
 *
 * Everything here that could be derived from NOAA is derived from NOAA at runtime — the
 * flood and ebb axes arrive with the predictions. What lives here is the judgement that
 * cannot: which passages are dangerous, at what speed, and why. Any station in the
 * bundled catalogue still contributes current to ETAs; only these carry verdicts.
 */

export interface TidalGate {
  id: string;
  name: string;
  position: Position;
  stationId: string;
  bin: number;
  /**
   * How close the track must pass to count as transiting.
   *
   * Tuned against the real Block Island route, which passes 0.34 NM from Plum Gut and
   * 3.35 NM from The Race while going through only the former. The Race and Plum Gut are
   * alternative doors out of the Sound (spec §9), so a radius generous enough to catch
   * The Race here would report a transit that never happens.
   */
  matchRadiusNm: number;
  /** Foul current above this is a hard fail. */
  hardFoulSpeedKn: number;
  /** Foul current above this is a caution. */
  cautionSpeedKn: number;
  /**
   * Sanity check only. The favourable direction is derived from the station's reported
   * flood/ebb axis against the boat's course; disagreement with this is logged as a
   * warning rather than silently trusted either way (spec §1).
   */
  expectedFavourable: { eastbound: 'ebb' | 'flood'; westbound: 'ebb' | 'flood' };
  notes: string;
}

export const TIDAL_GATES: TidalGate[] = [
  {
    id: 'the-race',
    name: 'The Race',
    position: { lat: 41.22818, lng: -72.06252 },
    stationId: 'LIS1001',
    bin: 1,
    matchRadiusNm: 2,
    hardFoulSpeedKn: 2.5,
    cautionSpeedKn: 1.0,
    // Flood 292° sets into the Sound (westbound); ebb 108° sets out (eastbound).
    expectedFavourable: { eastbound: 'ebb', westbound: 'flood' },
    notes:
      'Strongest gate on the Sound, between Fishers Island and Little Gull. Peaks over 3 kn. ' +
      'The northern door east — leads to Fishers Island Sound, Stonington and Watch Hill.',
  },
  {
    id: 'plum-gut',
    name: 'Plum Gut',
    position: { lat: 41.15917, lng: -72.2075 },
    stationId: 'LIS1012',
    bin: 1,
    matchRadiusNm: 1.5,
    hardFoulSpeedKn: 2.5,
    cautionSpeedKn: 1.0,
    // Flood 305° into the Sound; ebb 124° out.
    expectedFavourable: { eastbound: 'ebb', westbound: 'flood' },
    notes:
      'Narrow gut between Orient Point and Plum Island. Peaks over 3 kn, with standing ' +
      'waves on an ebb against easterly wind. The southern door east — leads to ' +
      'Gardiners Bay, Montauk and Block Island.',
  },
  {
    id: 'hell-gate',
    name: 'Hell Gate',
    position: { lat: 40.7783, lng: -73.9383 },
    stationId: 'NYH1924',
    bin: 1,
    matchRadiusNm: 1,
    hardFoulSpeedKn: 3.0,
    cautionSpeedKn: 1.5,
    expectedFavourable: { eastbound: 'flood', westbound: 'ebb' },
    notes:
      'East River passage to New York Harbor. Up to 5 kn. Only relevant westbound out of ' +
      'the Sound; transit near slack or with the tide.',
  },
  {
    id: 'throgs-neck',
    name: 'Throgs Neck',
    position: { lat: 40.80105, lng: -73.7921 },
    stationId: 'LIS1038',
    bin: 1,
    matchRadiusNm: 1,
    hardFoulSpeedKn: 3.0,
    cautionSpeedKn: 1.5,
    expectedFavourable: { eastbound: 'flood', westbound: 'ebb' },
    notes: 'Western entrance to the Sound, under the bridge. Moderate compared with the east end.',
  },
];

export function findGate(id: string): TidalGate | undefined {
  return TIDAL_GATES.find((g) => g.id === id);
}

/** The bindings a gate contributes to the constraint engine. */
export function gateBinding(gate: TidalGate): ConstraintBinding {
  return {
    id: `gate:${gate.id}`,
    label: gate.name,
    constraint: {
      kind: 'current-gate',
      stationId: gate.stationId,
      bin: gate.bin,
      cautionSpeedKn: gate.cautionSpeedKn,
      hardFoulSpeedKn: gate.hardFoulSpeedKn,
    },
    appliesTo: {
      kind: 'feature',
      position: gate.position,
      matchRadiusNm: gate.matchRadiusNm,
    },
    source: 'seed',
    sourceNote: `NOAA station ${gate.stationId}`,
    enabled: true,
  };
}
