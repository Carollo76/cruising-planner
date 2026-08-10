import { angularDifference } from '../../../utils/route-geometry';
import { formatLocalTime, type Utc } from '../../../utils/time';
import { isRefusal, polarSpeed, tackingPenalty, type Polar } from './polar';

/**
 * Sail, motor, or motorsail — and why.
 *
 * The `reason` string is the product here, not the label. "Motor" alone tells a skipper
 * nothing; "Motor — wind 4 kn from 070, dead ahead, and you need 5.5 kn to make Plum Gut
 * slack at 09:20" is a decision they can check and disagree with.
 */

export interface WindSample {
  speedKn: number;
  /** Direction the wind is coming FROM, degrees true — the meteorological convention. */
  directionDeg: number;
  gustKn?: number;
}

export interface LegPropulsionInput {
  legId: string;
  courseDeg: number;
  distanceNm: number;
  /** When the boat is projected to sail this leg. */
  at: Utc;
  wind: WindSample | null;
  polar: Polar | null;
  /** Speed needed to make the next binding deadline, if one binds this leg. */
  requiredSpeedKn: number | null;
  /** What the deadline is, for the reason sentence. */
  deadlineLabel: string | null;
  motoring: { cruiseSpeedKn: number; fuelGph: number };
  /** Days between the forecast being issued and this leg. Degrades confidence. */
  forecastLeadDays: number;
}

export interface LegPropulsionAdvice {
  legId: string;
  recommendation: 'sail' | 'motor' | 'motorsail' | 'unknown';
  /** Shown verbatim in the UI. */
  reason: string;
  trueWindAngle: number | null;
  trueWindSpeed: number | null;
  polarBoatSpeed: number | null;
  requiredSpeed: number | null;
  estimatedFuelGal: number;
  tackingOption?: { extraDistanceNm: number; extraTimeMin: number };
  confidence: 'high' | 'medium' | 'low';
}

/** Beyond about three days a wind forecast is a hint, not a schedule (§10). */
export function confidenceFor(leadDays: number): 'high' | 'medium' | 'low' {
  if (leadDays <= 1) return 'high';
  if (leadDays <= 3) return 'medium';
  return 'low';
}

/** Within this of the required speed, sailing plus engine gets there — motorsail. */
const MOTORSAIL_MARGIN_KN = 1.5;

function compass(deg: number): string {
  return String(Math.round(deg)).padStart(3, '0');
}

export function adviseLeg(input: LegPropulsionInput): LegPropulsionAdvice {
  const {
    legId,
    courseDeg,
    distanceNm,
    at,
    wind,
    polar,
    requiredSpeedKn,
    deadlineLabel,
    motoring,
    forecastLeadDays,
  } = input;

  const confidence = confidenceFor(forecastLeadDays);
  const motorHours = distanceNm / Math.max(0.1, motoring.cruiseSpeedKn);
  const fullMotorFuel = motorHours * motoring.fuelGph;

  const base = {
    legId,
    requiredSpeed: requiredSpeedKn,
    confidence,
  };

  // §10.3: with no polar there is no sail advice, and the app says why rather than
  // inventing numbers.
  if (!polar) {
    return {
      ...base,
      recommendation: 'unknown',
      reason:
        'No polar loaded for this boat, so sail performance cannot be estimated. ' +
        'Sail/motor advice is disabled rather than guessed.',
      trueWindAngle: null,
      trueWindSpeed: null,
      polarBoatSpeed: null,
      estimatedFuelGal: fullMotorFuel,
      confidence: 'low',
    };
  }

  if (!wind) {
    return {
      ...base,
      recommendation: 'unknown',
      reason: 'No wind forecast for this leg, so there is nothing to base sail advice on.',
      trueWindAngle: null,
      trueWindSpeed: null,
      polarBoatSpeed: null,
      estimatedFuelGal: fullMotorFuel,
      confidence: 'low',
    };
  }

  // TWA is the angle between where the wind comes from and where the boat is heading.
  const trueWindAngle = angularDifference(wind.directionDeg, courseDeg);
  const lookup = polarSpeed(polar, trueWindAngle, wind.speedKn);
  const windDesc = `wind ${Math.round(wind.speedKn)} kn from ${compass(wind.directionDeg)}`;

  if (isRefusal(lookup)) {
    if (lookup.reason === 'below-no-go') {
      const tack = tackingPenalty(polar, distanceNm, wind.speedKn);
      const canTack = tack !== null && tack.extraTimeMin < 240;

      // Beating is only worth offering when it does not blow the deadline.
      if (canTack && requiredSpeedKn !== null) {
        const vmgSpeed = distanceNm / (distanceNm / motoring.cruiseSpeedKn + tack.extraTimeMin / 60);
        if (vmgSpeed < requiredSpeedKn) {
          return {
            ...base,
            recommendation: 'motor',
            reason:
              `Motor — ${windDesc}, ${Math.round(trueWindAngle)}° off the bow. Beating would add ` +
              `${tack.extraDistanceNm.toFixed(1)} NM and ${tack.extraTimeMin} min, and you need ` +
              `${requiredSpeedKn.toFixed(1)} kn to make ${deadlineLabel ?? 'the next deadline'}.`,
            trueWindAngle,
            trueWindSpeed: wind.speedKn,
            polarBoatSpeed: null,
            estimatedFuelGal: fullMotorFuel,
            tackingOption: { extraDistanceNm: tack.extraDistanceNm, extraTimeMin: tack.extraTimeMin },
            confidence,
          };
        }
      }

      if (canTack) {
        return {
          ...base,
          recommendation: 'sail',
          reason:
            `Sail — ${windDesc}, ${Math.round(trueWindAngle)}° off the bow, so the rhumb line is ` +
            `inside the ${Math.round(tack.tackAngleDeg)}° tacking angle. Two tacks add ` +
            `${tack.extraDistanceNm.toFixed(1)} NM and about ${tack.extraTimeMin} min, with no ` +
            `deadline pressing.`,
          trueWindAngle,
          trueWindSpeed: wind.speedKn,
          polarBoatSpeed: null,
          estimatedFuelGal: 0,
          tackingOption: { extraDistanceNm: tack.extraDistanceNm, extraTimeMin: tack.extraTimeMin },
          confidence,
        };
      }

      return {
        ...base,
        recommendation: 'motor',
        reason: `Motor — ${windDesc}, dead ahead at ${Math.round(trueWindAngle)}°. ${lookup.detail}`,
        trueWindAngle,
        trueWindSpeed: wind.speedKn,
        polarBoatSpeed: null,
        estimatedFuelGal: fullMotorFuel,
        confidence,
      };
    }

    // Too light, or too strong for the certificate.
    const tail =
      lookup.reason === 'wind-too-light'
        ? 'Sailing at 2 kn into leftover chop is not sailing.'
        : 'Reef down and reassess; this is beyond the polar.';
    return {
      ...base,
      recommendation: lookup.reason === 'wind-too-light' ? 'motor' : 'unknown',
      reason: `${lookup.reason === 'wind-too-light' ? 'Motor' : 'Unclear'} — ${windDesc}. ${lookup.detail} ${tail}`,
      trueWindAngle,
      trueWindSpeed: wind.speedKn,
      polarBoatSpeed: null,
      estimatedFuelGal: lookup.reason === 'wind-too-light' ? fullMotorFuel : 0,
      confidence,
    };
  }

  const polarSpeedKn = lookup.boatSpeedKn;
  const shared = {
    ...base,
    trueWindAngle,
    trueWindSpeed: wind.speedKn,
    polarBoatSpeed: polarSpeedKn,
    confidence,
  };

  // No deadline binds this leg: sail if the boat moves respectably.
  if (requiredSpeedKn === null) {
    if (polarSpeedKn >= 3) {
      return {
        ...shared,
        recommendation: 'sail',
        reason:
          `Sail — ${windDesc}, ${Math.round(trueWindAngle)}° true wind angle, polar ` +
          `${polarSpeedKn.toFixed(1)} kn. Nothing to hurry for.`,
        estimatedFuelGal: 0,
      };
    }
    return {
      ...shared,
      recommendation: 'motor',
      reason:
        `Motor — ${windDesc} gives only ${polarSpeedKn.toFixed(1)} kn at ` +
        `${Math.round(trueWindAngle)}°, slower than the engine and slow enough to be miserable.`,
      estimatedFuelGal: fullMotorFuel,
    };
  }

  if (polarSpeedKn >= requiredSpeedKn) {
    return {
      ...shared,
      recommendation: 'sail',
      reason:
        `Sail — ${windDesc}, ${Math.round(trueWindAngle)}° true wind angle, polar ` +
        `${polarSpeedKn.toFixed(1)} kn against the ${requiredSpeedKn.toFixed(1)} kn needed for ` +
        `${deadlineLabel ?? 'the next deadline'}.`,
      estimatedFuelGal: 0,
    };
  }

  if (polarSpeedKn >= requiredSpeedKn - MOTORSAIL_MARGIN_KN) {
    // Motor only for the shortfall, so the fuel figure reflects what is actually burnt.
    const shortfallFraction = Math.min(1, (requiredSpeedKn - polarSpeedKn) / MOTORSAIL_MARGIN_KN);
    return {
      ...shared,
      recommendation: 'motorsail',
      reason:
        `Motorsail — ${windDesc} gives ${polarSpeedKn.toFixed(1)} kn, ` +
        `${(requiredSpeedKn - polarSpeedKn).toFixed(1)} kn short of the ` +
        `${requiredSpeedKn.toFixed(1)} kn needed for ${deadlineLabel ?? 'the next deadline'}. ` +
        `Engine on low to make it up.`,
      estimatedFuelGal: fullMotorFuel * shortfallFraction,
    };
  }

  return {
    ...shared,
    recommendation: 'motor',
    reason:
      `Motor — ${windDesc} gives only ${polarSpeedKn.toFixed(1)} kn at ` +
      `${Math.round(trueWindAngle)}°, and you need ${requiredSpeedKn.toFixed(1)} kn to make ` +
      `${deadlineLabel ?? 'the next deadline'}${deadlineLabel ? '' : ''} at ${formatLocalTime(at)}.`,
    estimatedFuelGal: fullMotorFuel,
  };
}

/** Whole-passage roll-up for the itinerary view. */
export interface PropulsionSummary {
  sailingNm: number;
  motoringNm: number;
  motorsailingNm: number;
  fuelGal: number;
  /** Lowest confidence across the legs — the summary is only as good as its worst leg. */
  confidence: 'high' | 'medium' | 'low';
  unknownLegs: number;
}

export function summarise(
  advice: LegPropulsionAdvice[],
  distances: Map<string, number>
): PropulsionSummary {
  let sailingNm = 0;
  let motoringNm = 0;
  let motorsailingNm = 0;
  let fuelGal = 0;
  let unknownLegs = 0;
  let confidence: 'high' | 'medium' | 'low' = 'high';

  for (const leg of advice) {
    const nm = distances.get(leg.legId) ?? 0;
    if (leg.recommendation === 'sail') sailingNm += nm;
    else if (leg.recommendation === 'motor') motoringNm += nm;
    else if (leg.recommendation === 'motorsail') motorsailingNm += nm;
    else unknownLegs++;

    fuelGal += leg.estimatedFuelGal;
    if (leg.confidence === 'low') confidence = 'low';
    else if (leg.confidence === 'medium' && confidence === 'high') confidence = 'medium';
  }

  return { sailingNm, motoringNm, motorsailingNm, fuelGal, confidence, unknownLegs };
}

/** Flags a plan whose motoring exceeds what the tank supports (§10). */
export function exceedsFuelRange(summary: PropulsionSummary, tankGallons: number): boolean {
  return summary.fuelGal > tankGallons;
}
