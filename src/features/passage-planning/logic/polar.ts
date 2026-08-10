/**
 * Boat polars: predicted speed for a true wind angle and speed.
 *
 * The governing rule, from §10 of the spec, is that polar numbers are never synthesised.
 * Outside the grid this returns null and the caller disables sail advice — a fabricated
 * polar produces confident, plausible, wrong recommendations at 0400, which is worse
 * than no feature. That means no extrapolation beyond the certificate's wind range and
 * nothing at all below the lowest tabulated beat angle.
 */

export interface PolarGrid {
  /** True wind speeds, ascending, in knots. */
  windSpeeds: number[];
  /** True wind angles, ascending, in degrees. */
  windAngles: number[];
  /** speeds[angleIndex][windIndex] — boat speed in knots. */
  speeds: number[][];
}

export interface PolarMeta {
  id: string;
  name: string;
  /** Where the numbers came from — provenance is part of the data. */
  source: 'seed' | 'user-edited' | 'fitted';
  /** Free text from the file header: certificate, boat, VPP year. */
  provenance: string;
  draftMetres: number | null;
  /** Bumped when a user edits, so a later fitted polar can supersede without migration. */
  version: number;
  updatedAt: number;
}

export interface Polar extends PolarMeta {
  grid: PolarGrid;
}

/**
 * Parses the checked-in CSV format: `#` comments, a `twa,<tws>,<tws>...` header, then one
 * row per angle. Comment lines carry the provenance and are preserved, not discarded.
 */
export function parsePolarCsv(csv: string, meta: Omit<PolarMeta, 'provenance'>): Polar {
  const lines = csv.split('\n').map((l) => l.trim());
  const comments = lines.filter((l) => l.startsWith('#')).map((l) => l.replace(/^#\s?/, ''));
  const rows = lines.filter((l) => l.length > 0 && !l.startsWith('#'));

  if (rows.length < 2) throw new Error('polar file has no data rows');

  const header = rows[0].split(',').map((c) => c.trim());
  if (header[0].toLowerCase() !== 'twa') {
    throw new Error(`polar header must start with "twa", got "${header[0]}"`);
  }

  const windSpeeds = header.slice(1).map(Number);
  if (windSpeeds.some((w) => !Number.isFinite(w))) {
    throw new Error('polar header contains a non-numeric wind speed');
  }

  const windAngles: number[] = [];
  const speeds: number[][] = [];

  for (const row of rows.slice(1)) {
    const cells = row.split(',').map(Number);
    if (cells.length !== windSpeeds.length + 1) {
      throw new Error(`polar row has ${cells.length - 1} speeds, expected ${windSpeeds.length}`);
    }
    if (cells.some((c) => !Number.isFinite(c))) {
      throw new Error(`polar row contains a non-numeric value: ${row}`);
    }
    windAngles.push(cells[0]);
    speeds.push(cells.slice(1));
  }

  return {
    ...meta,
    provenance: comments.join('\n'),
    grid: { windSpeeds, windAngles, speeds },
  };
}

export interface PolarLookup {
  boatSpeedKn: number;
  /** True when the request sat inside the tabulated grid rather than on its edge. */
  interpolated: boolean;
}

/** Lowest angle the certificate tabulates — below this the boat cannot sail the rhumb line. */
export function noGoAngle(polar: Polar): number {
  return polar.grid.windAngles[0];
}

export function windRange(polar: Polar): { min: number; max: number } {
  const speeds = polar.grid.windSpeeds;
  return { min: speeds[0], max: speeds[speeds.length - 1] };
}

/** Why a lookup produced nothing, in words the UI can show verbatim. */
export type PolarRefusal =
  | { reason: 'below-no-go'; detail: string }
  | { reason: 'wind-too-light'; detail: string }
  | { reason: 'wind-too-strong'; detail: string };

/**
 * Boat speed for a wind angle and speed, or a refusal explaining why not.
 *
 * Bilinear interpolation inside the grid. Deliberately no extrapolation: the certificate
 * covers 4–24 kn and angles from the beat angle to dead downwind, and inventing values
 * beyond that is exactly the fabrication §10.3 forbids.
 */
export function polarSpeed(
  polar: Polar,
  trueWindAngleDeg: number,
  trueWindSpeedKn: number
): PolarLookup | PolarRefusal {
  const { windSpeeds, windAngles, speeds } = polar.grid;

  // Symmetric about the wind axis: 300 degrees is the same as 60.
  const angle = Math.abs(((trueWindAngleDeg % 360) + 360) % 360 > 180
    ? 360 - (((trueWindAngleDeg % 360) + 360) % 360)
    : ((trueWindAngleDeg % 360) + 360) % 360);

  // Wind strength is tested before angle on purpose. In 3 knots of wind the honest
  // reason is that there is no wind, not that it happens to be on the nose — and the
  // reason string is the part a skipper actually acts on.
  const { min, max } = windRange(polar);
  if (trueWindSpeedKn < min) {
    return {
      reason: 'wind-too-light',
      detail:
        `${trueWindSpeedKn.toFixed(0)} kn is below the ${min} kn floor of this polar — ` +
        `no sailing speed is published this light.`,
    };
  }
  if (trueWindSpeedKn > max) {
    return {
      reason: 'wind-too-strong',
      detail:
        `${trueWindSpeedKn.toFixed(0)} kn is above the ${max} kn ceiling of this polar — ` +
        `no published speed, and you would be reefed well down.`,
    };
  }

  if (angle < windAngles[0]) {
    return {
      reason: 'below-no-go',
      detail:
        `${Math.round(angle)}° off the wind is inside this boat's ${Math.round(windAngles[0])}° ` +
        `no-go angle — the rhumb line cannot be sailed directly.`,
    };
  }

  const cappedAngle = Math.min(angle, windAngles[windAngles.length - 1]);
  const [a0, a1, at] = bracket(windAngles, cappedAngle);
  const [w0, w1, wt] = bracket(windSpeeds, trueWindSpeedKn);

  const s00 = speeds[a0][w0];
  const s01 = speeds[a0][w1];
  const s10 = speeds[a1][w0];
  const s11 = speeds[a1][w1];

  const low = s00 + (s01 - s00) * wt;
  const high = s10 + (s11 - s10) * wt;

  return { boatSpeedKn: low + (high - low) * at, interpolated: at > 0 || wt > 0 };
}

/** Index pair bracketing a value in an ascending array, plus the fraction between them. */
function bracket(values: number[], target: number): [number, number, number] {
  if (target <= values[0]) return [0, 0, 0];
  const last = values.length - 1;
  if (target >= values[last]) return [last, last, 0];

  for (let i = 1; i < values.length; i++) {
    if (values[i] >= target) {
      const span = values[i] - values[i - 1];
      return [i - 1, i, span === 0 ? 0 : (target - values[i - 1]) / span];
    }
  }
  return [last, last, 0];
}

export function isRefusal(result: PolarLookup | PolarRefusal): result is PolarRefusal {
  return 'reason' in result;
}

/**
 * Best speed made good toward a course inside the no-go band, by tacking.
 *
 * Scans tabulated angles at or above the no-go angle for the one giving the highest
 * component toward the rhumb line, and reports the extra distance that costs. Returns
 * null when even the best angle makes no progress, which is the honest answer in very
 * light air.
 */
export function bestUpwindVmg(
  polar: Polar,
  trueWindSpeedKn: number
): { angleDeg: number; boatSpeedKn: number; vmgKn: number } | null {
  let best: { angleDeg: number; boatSpeedKn: number; vmgKn: number } | null = null;

  for (const angle of polar.grid.windAngles) {
    if (angle > 90) break; // upwind only
    const result = polarSpeed(polar, angle, trueWindSpeedKn);
    if (isRefusal(result)) continue;
    const vmg = result.boatSpeedKn * Math.cos((angle * Math.PI) / 180);
    if (vmg > 0 && (!best || vmg > best.vmgKn)) {
      best = { angleDeg: angle, boatSpeedKn: result.boatSpeedKn, vmgKn: vmg };
    }
  }
  return best;
}

/**
 * Extra distance and time from beating a leg that cannot be sailed directly.
 *
 * Distance sailed is the rhumb line divided by cos of the tacking angle — the standard
 * two-tack result, independent of how many tacks are actually put in.
 */
export function tackingPenalty(
  polar: Polar,
  legDistanceNm: number,
  trueWindSpeedKn: number
): { extraDistanceNm: number; extraTimeMin: number; tackAngleDeg: number } | null {
  const best = bestUpwindVmg(polar, trueWindSpeedKn);
  if (!best) return null;

  const distanceSailed = legDistanceNm / Math.cos((best.angleDeg * Math.PI) / 180);
  const timeTacking = distanceSailed / best.boatSpeedKn;
  const timeDirect = legDistanceNm / best.boatSpeedKn;

  return {
    extraDistanceNm: distanceSailed - legDistanceNm,
    extraTimeMin: Math.round((timeTacking - timeDirect) * 60),
    tackAngleDeg: best.angleDeg,
  };
}
