import type { Route, Position } from '../../../types/navigation';
import type { Destination } from '../../../types/destination';
import type { WeatherThresholds } from '../../../constants/weather-thresholds';
import type { WindyHourlyPoint } from '../../../services/windy-weather';
import {
  fetchWindyPointForecast,
  fetchWindyWaves,
  mergeWindyForecasts,
  findClosestHourly,
} from '../../../services/windy-weather';
import {
  fetchCurrentPredictions,
  findRelevantCurrentStations,
  findCurrentAtTime,
  type CurrentStation,
  type CurrentPrediction,
  type CurrentDataPoint,
} from '../../../services/noaa-currents';
import { distanceNM, interpolatePosition } from '../../../utils/navigation-math';
import { closestApproachToRoute, closestApproachToSegment } from '../../../utils/route-geometry';

export type SafetyRating = 'go' | 'caution' | 'no-go';

export interface HourlyAssessment {
  timestamp: number; // ms UTC
  /** Position along the route at this hour */
  position: Position;
  /** Leg index this hour falls in */
  legIndex: number;
  windSpeedKnots?: number;
  windDirectionDeg?: number;
  gustKnots?: number;
  waveHeightFt?: number;
  temperatureF?: number;
  pressureHpa?: number;
  /** Current speed at the nearest critical station at this hour, if any */
  currentSpeedKnots?: number;
  currentType?: 'flood' | 'ebb' | 'slack';
  currentStationName?: string;
  windRating: SafetyRating;
  gustRating: SafetyRating;
  waveRating: SafetyRating;
  currentRating: SafetyRating;
  overallRating: SafetyRating;
  warnings: string[];
}

export interface CurrentTransitPlan {
  station: CurrentStation;
  /** When boat is expected to arrive at the station */
  arrivalTimestamp: number;
  currentAtArrival: CurrentDataPoint | null;
  /** Nearest slack water within ±4 hours of arrival */
  nearestSlackTimestamp: number | null;
  /** Difference from arrival to nearest slack, in minutes */
  minutesFromSlack: number | null;
  rating: SafetyRating;
  recommendation: string;
}

export interface RouteAssessment {
  routeId: string;
  routeName: string;
  departureTime: number; // ms UTC
  arrivalTime: number;
  cruisingSpeedKnots: number;
  totalDistanceNM: number;
  /** When the forecast data was fetched from Windy */
  dataFetchedAt: number;
  /** True if wave data was unavailable — assessment is wind-only */
  waveDataUnavailable: boolean;
  hourly: HourlyAssessment[];
  overallRating: SafetyRating;
  summary: {
    maxWindKnots: number;
    maxGustKnots: number;
    maxWaveFt: number;
    maxCurrentKnots: number;
    hoursOfConcern: number;
    caution: string[];
    noGo: string[];
  };
  bailoutPoints: BailoutPoint[];
  currentTransits: CurrentTransitPlan[];
  /**
   * Critical passages close to the route but outside the matching threshold.
   *
   * Without this, an absent passage is ambiguous: the skipper cannot tell "The Race is
   * nowhere near this route" from "we failed to fetch it". Naming the near misses with
   * their distance makes the silence legible.
   */
  nearbyCriticalPassages: Array<{ name: string; distanceNm: number }>;
  /** Stations whose predictions could not be fetched, so their passage was not assessed. */
  currentDataFailures: string[];
  recommendation: string;
}

export interface BailoutPoint {
  destination: Destination;
  /** Closest perpendicular distance from the route line (NM) */
  distanceFromRouteNM: number;
  /** Approximate hours into the voyage when you're closest to this bailout */
  hoursIntoVoyage: number;
  /** How long it takes to divert from route and reach this bailout at cruising speed */
  divertTimeHours: number;
  closestWaypointIndex: number;
}

/**
 * Rate a value against go/caution thresholds. Anything at or above the caution threshold
 * is no-go, so the third threshold the callers used to pass was never read.
 */
function rateValue(value: number, go: number, caution: number): SafetyRating {
  if (value < go) return 'go';
  if (value < caution) return 'caution';
  return 'no-go';
}

/** Worst of multiple ratings — no-go beats caution beats go */
function worstRating(...ratings: SafetyRating[]): SafetyRating {
  if (ratings.includes('no-go')) return 'no-go';
  if (ratings.includes('caution')) return 'caution';
  return 'go';
}

/** Compute the expected position along a route at a given elapsed-hours offset from departure */
export function positionAtHour(route: Route, hoursElapsed: number): { position: Position; legIndex: number } {
  if (route.waypoints.length === 0) {
    return { position: { lat: 0, lng: 0 }, legIndex: 0 };
  }
  if (route.waypoints.length === 1 || hoursElapsed <= 0) {
    return { position: route.waypoints[0].position, legIndex: 0 };
  }

  let cumulativeHours = 0;

  for (let i = 0; i < route.legs.length; i++) {
    const leg = route.legs[i];
    const legHours = leg.estimatedTimeHours;
    if (hoursElapsed <= cumulativeHours + legHours) {
      const fraction = legHours > 0 ? (hoursElapsed - cumulativeHours) / legHours : 1;
      const from = route.waypoints[i].position;
      const to = route.waypoints[i + 1].position;
      return {
        position: interpolatePosition(from, to, Math.max(0, Math.min(1, fraction))),
        legIndex: i,
      };
    }
    cumulativeHours += legHours;
  }

  // Past end of route — return final waypoint
  return {
    position: route.waypoints[route.waypoints.length - 1].position,
    legIndex: route.legs.length - 1,
  };
}

interface AssessHourOptions {
  point: WindyHourlyPoint;
  thresholds: WeatherThresholds;
  /** Current at nearest critical station for this hour, if any */
  current?: CurrentDataPoint | null;
  currentStationName?: string;
  /** Is the boat currently IN a critical passage at this hour? */
  inCriticalPassage?: boolean;
}

function assessHour({
  point,
  thresholds,
  current,
  currentStationName,
  inCriticalPassage,
}: AssessHourOptions): {
  windRating: SafetyRating;
  gustRating: SafetyRating;
  waveRating: SafetyRating;
  currentRating: SafetyRating;
  overallRating: SafetyRating;
  warnings: string[];
} {
  const warnings: string[] = [];

  const windRating: SafetyRating =
    point.windSpeedKnots !== undefined
      ? rateValue(point.windSpeedKnots, thresholds.wind.go, thresholds.wind.caution)
      : 'go';

  const gustRating: SafetyRating =
    point.gustKnots !== undefined
      ? rateValue(point.gustKnots, thresholds.gusts.go, thresholds.gusts.caution)
      : 'go';

  const waveRating: SafetyRating =
    point.waveHeightFt !== undefined
      ? rateValue(point.waveHeightFt, thresholds.waves.go, thresholds.waves.caution)
      : 'go';

  // Tidal current rating — only matters in/near critical passages
  let currentRating: SafetyRating = 'go';
  if (current && inCriticalPassage) {
    const abs = current.absSpeedKnots;
    // For a 6kt cruising sailboat, currents matter:
    //   <1.5kt = GO (manageable)
    //   1.5-3kt = CAUTION (significant impact on speed/steering)
    //   >3kt = NO-GO unless favorable direction (still punishing in weather)
    if (abs > 3) currentRating = 'no-go';
    else if (abs > 1.5) currentRating = 'caution';

    // Wind-against-tide in strong currents is particularly dangerous (standing waves)
    if (abs > 2 && point.windSpeedKnots && point.windSpeedKnots > 15) {
      currentRating = worstRating(currentRating, 'caution');
      warnings.push(
        `Wind-against-tide at ${currentStationName}: ${abs.toFixed(1)} kt current + ${point.windSpeedKnots.toFixed(0)} kt wind — expect standing waves`
      );
    }
  }

  if (windRating === 'caution')
    warnings.push(`Wind ${point.windSpeedKnots?.toFixed(0)} kt (caution above ${thresholds.wind.go})`);
  if (windRating === 'no-go')
    warnings.push(`Wind ${point.windSpeedKnots?.toFixed(0)} kt exceeds safety limit`);

  if (gustRating === 'caution')
    warnings.push(`Gusts ${point.gustKnots?.toFixed(0)} kt (caution above ${thresholds.gusts.go})`);
  if (gustRating === 'no-go')
    warnings.push(`Gusts ${point.gustKnots?.toFixed(0)} kt exceed limit`);

  if (waveRating === 'caution')
    warnings.push(`Waves ${point.waveHeightFt?.toFixed(1)} ft (caution above ${thresholds.waves.go})`);
  if (waveRating === 'no-go')
    warnings.push(`Waves ${point.waveHeightFt?.toFixed(1)} ft exceed limit`);

  if (currentRating === 'caution' && current)
    warnings.push(
      `Strong current at ${currentStationName}: ${current.absSpeedKnots.toFixed(1)} kt ${current.type}`
    );
  if (currentRating === 'no-go' && current)
    warnings.push(
      `Dangerous current at ${currentStationName}: ${current.absSpeedKnots.toFixed(1)} kt — transit only near slack`
    );

  return {
    windRating,
    gustRating,
    waveRating,
    currentRating,
    overallRating: worstRating(windRating, gustRating, waveRating, currentRating),
    warnings,
  };
}

/** Identify destinations suitable as bailout points along the route.
 *  Samples the ROUTE LINE (not just waypoints) at regular intervals so mid-route
 *  harbors don't get missed. Returns bailouts spread across the voyage timeline.
 *  Default 15 NM radius catches cross-sound bailouts — e.g. Connecticut harbors
 *  when sailing along the Long Island north shore. A 15 NM divert at 6 kt is
 *  2.5 hours, which is a reasonable tradeoff in deteriorating conditions. */
export function findBailoutPoints(
  route: Route,
  destinations: Destination[],
  maxDistanceNM = 15
): BailoutPoint[] {
  if (route.waypoints.length < 2) return [];

  // Sample the route path every ~1 NM by stepping through in small time increments
  const speed = Math.max(1, route.expectedSpeedKnots);
  const totalHours = route.totalEstimatedTimeHours;
  const stepHours = 1 / speed / 2; // ~0.5 NM resolution
  const samples: Array<{ position: Position; hoursElapsed: number; legIndex: number }> = [];
  for (let h = 0; h <= totalHours + stepHours; h += stepHours) {
    const sample = positionAtHour(route, Math.min(h, totalHours));
    samples.push({ ...sample, hoursElapsed: Math.min(h, totalHours) });
  }

  const candidates: BailoutPoint[] = [];
  const seenIds = new Set<string>();

  for (const d of destinations) {
    if (seenIds.has(d.id)) continue;
    const isProtected =
      d.type === 'anchorage' ||
      d.type === 'mooring' ||
      d.type === 'marina' ||
      d.type === 'yacht-club' ||
      d.type === 'town-dock';
    if (!isProtected) continue;

    // Find the point along the route line closest to this destination
    let minDist = Infinity;
    let closestHours = 0;
    let closestLegIdx = 0;
    for (const sample of samples) {
      const dist = distanceNM(sample.position, d.position);
      if (dist < minDist) {
        minDist = dist;
        closestHours = sample.hoursElapsed;
        closestLegIdx = sample.legIndex;
      }
    }

    if (minDist <= maxDistanceNM) {
      candidates.push({
        destination: d,
        distanceFromRouteNM: minDist,
        hoursIntoVoyage: closestHours,
        divertTimeHours: minDist / speed,
        closestWaypointIndex: closestLegIdx,
      });
      seenIds.add(d.id);
    }
  }

  // Sort by when they're reachable along the voyage
  return candidates.sort((a, b) => a.hoursIntoVoyage - b.hoursIntoVoyage);
}

interface AssessRouteOptions {
  route: Route;
  departureTime: Date;
  thresholds: WeatherThresholds;
  windyApiKey: string;
  destinations: Destination[];
}

/** Main entry: fetch forecasts for the route's waypoints and build an hour-by-hour assessment */
export async function assessRoute({
  route,
  departureTime,
  thresholds,
  windyApiKey,
  destinations,
}: AssessRouteOptions): Promise<RouteAssessment> {
  if (route.waypoints.length === 0) {
    throw new Error('Route has no waypoints');
  }

  // Sample every ~3 waypoints (or at least the first, middle, last) to keep API calls minimal
  const samplePoints: Position[] = [];
  const step = Math.max(1, Math.floor(route.waypoints.length / 3));
  for (let i = 0; i < route.waypoints.length; i += step) {
    samplePoints.push(route.waypoints[i].position);
  }
  // Always include the final waypoint
  const last = route.waypoints[route.waypoints.length - 1].position;
  if (
    samplePoints.length === 0 ||
    samplePoints[samplePoints.length - 1].lat !== last.lat ||
    samplePoints[samplePoints.length - 1].lng !== last.lng
  ) {
    samplePoints.push(last);
  }

  // Fetch wind+gust+temp for every sample point (1 call each), plus waves for the midpoint
  const windForecasts = await Promise.all(
    samplePoints.map((p) => fetchWindyPointForecast(p, windyApiKey))
  );
  const midpoint = samplePoints[Math.floor(samplePoints.length / 2)];
  const waveForecast = await fetchWindyWaves(midpoint, windyApiKey).catch(() => null);

  // Find any NOAA currents stations within 5 NM of the route and fetch their predictions
  const waypointPositions = route.waypoints.map((w) => w.position);
  const relevantStations = findRelevantCurrentStations(waypointPositions, 5);
  // Critical passages just outside the threshold, so their absence below can be explained
  // rather than left as an unexplained blank.
  const matchedIds = new Set(relevantStations.map((s) => s.id));
  const nearbyCriticalPassages = findRelevantCurrentStations(waypointPositions, 15)
    .filter((s) => s.critical && !matchedIds.has(s.id))
    .map((s) => ({ name: s.name, distanceNm: s.distanceFromRouteNM }));
  const totalHours = Math.ceil(route.totalEstimatedTimeHours);
  const endTime = new Date(departureTime.getTime() + (totalHours + 2) * 60 * 60 * 1000);

  const currentPredictions = new Map<string, CurrentPrediction>();
  const currentDataFailures: string[] = [];
  await Promise.all(
    relevantStations.map(async (station) => {
      try {
        const pred = await fetchCurrentPredictions(station, departureTime, endTime);
        currentPredictions.set(station.id, pred);
      } catch (err) {
        // Surfaced in the result, not just logged. A passage silently dropped because its
        // fetch failed looks identical to a passage that is not on the route.
        currentDataFailures.push(`${station.name}: ${(err as Error).message}`);
        console.warn(`Failed to fetch currents for ${station.name}:`, err);
      }
    })
  );

  // Build hourly assessments: step through the voyage in 1-hour increments
  const hourly: HourlyAssessment[] = [];
  let maxWind = 0;
  let maxGust = 0;
  let maxWave = 0;
  let maxCurrent = 0;
  let hoursOfConcern = 0;
  const cautions = new Set<string>();
  const noGos = new Set<string>();

  for (let h = 0; h <= totalHours; h++) {
    const ts = departureTime.getTime() + h * 60 * 60 * 1000;
    const { position, legIndex } = positionAtHour(route, h);

    // Use the forecast for the sample point closest to this position
    let bestForecast = windForecasts[0];
    let bestDist = distanceNM(samplePoints[0], position);
    for (let i = 1; i < samplePoints.length; i++) {
      const d = distanceNM(samplePoints[i], position);
      if (d < bestDist) {
        bestDist = d;
        bestForecast = windForecasts[i];
      }
    }

    const sources = [bestForecast];
    if (waveForecast) sources.push(waveForecast);
    const merged = mergeWindyForecasts(...sources);
    const point = findClosestHourly(merged, ts);
    if (!point) continue;

    const {
      current: nearestCurrent,
      stationName: nearestStationName,
      inCriticalPassage,
    } = currentForHour(route, relevantStations, currentPredictions, h, ts);

    const { windRating, gustRating, waveRating, currentRating, overallRating, warnings } = assessHour({
      point,
      thresholds,
      current: nearestCurrent,
      currentStationName: nearestStationName,
      inCriticalPassage,
    });

    hourly.push({
      timestamp: ts,
      position,
      legIndex,
      windSpeedKnots: point.windSpeedKnots,
      windDirectionDeg: point.windDirectionDeg,
      gustKnots: point.gustKnots,
      waveHeightFt: point.waveHeightFt,
      temperatureF: point.temperatureF,
      pressureHpa: point.pressureHpa,
      currentSpeedKnots: nearestCurrent?.absSpeedKnots,
      currentType: nearestCurrent?.type,
      currentStationName: inCriticalPassage ? nearestStationName : undefined,
      windRating,
      gustRating,
      waveRating,
      currentRating,
      overallRating,
      warnings,
    });

    if (point.windSpeedKnots) maxWind = Math.max(maxWind, point.windSpeedKnots);
    if (point.gustKnots) maxGust = Math.max(maxGust, point.gustKnots);
    if (point.waveHeightFt) maxWave = Math.max(maxWave, point.waveHeightFt);
    if (nearestCurrent && inCriticalPassage)
      maxCurrent = Math.max(maxCurrent, nearestCurrent.absSpeedKnots);
    if (overallRating !== 'go') hoursOfConcern++;
    warnings.forEach((w) => {
      if (overallRating === 'no-go') noGos.add(w);
      else if (overallRating === 'caution') cautions.add(w);
    });
  }

  const overallRating: SafetyRating = worstRating(...hourly.map((h) => h.overallRating));

  // Build current transit plans: for each critical station, compute arrival time, current, slack
  const currentTransits: CurrentTransitPlan[] = [];
  for (const station of relevantStations) {
    if (!station.critical) continue;
    const pred = currentPredictions.get(station.id);
    if (!pred) continue;

    // Arrival is estimated from distance along the track to the point of closest
    // approach, not from the nearest waypoint. Waypoints can be far from where the boat
    // actually passes a station — on the Block Island route The Race is 7.2 NM from the
    // nearest waypoint while the track goes within 3.35 NM — which put the transit
    // several hours out.
    const approach = closestApproachToRoute(
      { lat: station.lat, lng: station.lng },
      waypointPositions
    );
    const speedKn = route.expectedSpeedKnots > 0 ? route.expectedSpeedKnots : 6;
    const hoursToStation = approach ? approach.routeDistanceNm / speedKn : 0;
    const arrivalTs = departureTime.getTime() + hoursToStation * 60 * 60 * 1000;

    const currentAtArrival = findCurrentAtTime(pred, arrivalTs);
    // Find nearest slack within ±4 hours
    const fourHours = 4 * 60 * 60 * 1000;
    const slackCandidates = pred.data.filter(
      (d) =>
        d.type === 'slack' &&
        Math.abs(d.timestamp - arrivalTs) < fourHours
    );
    const nearestSlack = slackCandidates.reduce<CurrentDataPoint | null>((best, curr) => {
      if (!best) return curr;
      return Math.abs(curr.timestamp - arrivalTs) < Math.abs(best.timestamp - arrivalTs) ? curr : best;
    }, null);

    const minutesFromSlack = nearestSlack
      ? Math.round((nearestSlack.timestamp - arrivalTs) / 60000)
      : null;

    let rating: SafetyRating = 'go';
    let recommendation = '';
    if (currentAtArrival) {
      const abs = currentAtArrival.absSpeedKnots;
      if (abs < 1) {
        rating = 'go';
        recommendation = `Near slack at arrival — ideal transit conditions.`;
      } else if (abs < 2) {
        rating = 'go';
        recommendation = `Moderate ${currentAtArrival.type} current (${abs.toFixed(1)} kt) — manageable.`;
      } else if (abs < 3) {
        rating = 'caution';
        if (nearestSlack && minutesFromSlack !== null && Math.abs(minutesFromSlack) > 30) {
          const when = minutesFromSlack > 0 ? 'later' : 'earlier';
          recommendation = `${abs.toFixed(1)} kt ${currentAtArrival.type} at arrival. Slack water is ${Math.abs(minutesFromSlack)} min ${when} — consider shifting departure.`;
        } else {
          recommendation = `${abs.toFixed(1)} kt ${currentAtArrival.type} current — plan for extra time and watch steerage.`;
        }
      } else {
        rating = 'no-go';
        if (nearestSlack && minutesFromSlack !== null) {
          const when = minutesFromSlack > 0 ? 'later' : 'earlier';
          recommendation = `DANGEROUS: ${abs.toFixed(1)} kt ${currentAtArrival.type}. Shift departure ${Math.abs(minutesFromSlack)} minutes ${when} to hit slack water.`;
        } else {
          recommendation = `DANGEROUS: ${abs.toFixed(1)} kt ${currentAtArrival.type}. Transit only at slack — check tide tables.`;
        }
      }
    }

    currentTransits.push({
      station,
      arrivalTimestamp: arrivalTs,
      currentAtArrival,
      nearestSlackTimestamp: nearestSlack?.timestamp ?? null,
      minutesFromSlack,
      rating,
      recommendation,
    });
  }

  const bailoutPoints = findBailoutPoints(route, destinations);

  const recommendation = buildRecommendation(overallRating, {
    maxWind,
    maxGust,
    maxWave,
    hoursOfConcern,
    totalHours: hourly.length,
  });

  const wavesMissing = waveForecast?.waveDataUnavailable ?? waveForecast === null;
  const dataFetchedAt = windForecasts[0]?.fetchedAt ?? Date.now();

  return {
    routeId: route.id,
    routeName: route.name,
    departureTime: departureTime.getTime(),
    arrivalTime: departureTime.getTime() + totalHours * 60 * 60 * 1000,
    cruisingSpeedKnots: route.expectedSpeedKnots,
    totalDistanceNM: route.totalDistanceNM,
    dataFetchedAt,
    waveDataUnavailable: wavesMissing,
    hourly,
    overallRating,
    summary: {
      maxWindKnots: maxWind,
      maxGustKnots: maxGust,
      maxWaveFt: maxWave,
      // Never lower than what a critical passage actually reports: the hourly scan can
      // still under-sample a narrow gate, and a headline that contradicts the passage
      // below it is worse than no headline.
      maxCurrentKnots: Math.max(
        maxCurrent,
        ...currentTransits.map((t) => t.currentAtArrival?.absSpeedKnots ?? 0)
      ),
      hoursOfConcern,
      caution: Array.from(cautions),
      noGo: Array.from(noGos),
    },
    bailoutPoints,
    currentTransits,
    nearbyCriticalPassages,
    currentDataFailures,
    recommendation,
  };
}

function buildRecommendation(
  rating: SafetyRating,
  stats: { maxWind: number; maxGust: number; maxWave: number; hoursOfConcern: number; totalHours: number }
): string {
  if (rating === 'go') {
    return `Conditions look favorable. Peak wind ${stats.maxWind.toFixed(0)} kt, gusts ${stats.maxGust.toFixed(0)} kt, waves ${stats.maxWave.toFixed(1)} ft. Good to go with standard precautions.`;
  }
  if (rating === 'caution') {
    return `Conditions are marginal for ${stats.hoursOfConcern} of ${stats.totalHours} hours. Peak wind ${stats.maxWind.toFixed(0)} kt, gusts ${stats.maxGust.toFixed(0)} kt, waves ${stats.maxWave.toFixed(1)} ft. Proceed with extra caution, reef early, ensure crew is comfortable, and have bailout options ready.`;
  }
  return `Conditions exceed safe limits for family cruising during ${stats.hoursOfConcern} hours of the voyage. Peak wind ${stats.maxWind.toFixed(0)} kt, gusts ${stats.maxGust.toFixed(0)} kt, waves ${stats.maxWave.toFixed(1)} ft. Recommend postponing or choosing a different window.`;
}

/** Scan the next N days at 6-hour intervals and find the best departure time for a GO rating */
export interface WeatherWindow {
  departureTime: number;
  rating: SafetyRating;
  score: number; // lower is better — counts hours of concern + normalized peak wind
  maxWind: number;
  maxWave: number;
  hoursOfConcern: number;
}

/**
 * Current at the boat's position for one hour of a passage.
 *
 * Extracted because the detailed assessment and the departure-window scan were computing
 * this differently — the scan did not compute it at all, so a window could be rated GO
 * while assessing that same departure returned CAUTION. Two verdicts for one departure is
 * the contradictory-results failure this app is explicitly built to avoid.
 */
function currentForHour(
  route: Route,
  stations: Array<CurrentStation & { distanceFromRouteNM: number }>,
  predictions: Map<string, CurrentPrediction>,
  hour: number,
  timestamp: number
): { current: CurrentDataPoint | null; stationName?: string; inCriticalPassage: boolean } {
  const { position } = positionAtHour(route, hour);
  const nextPosition = positionAtHour(route, hour + 1).position;

  let current: CurrentDataPoint | null = null;
  let stationName: string | undefined;
  let inCriticalPassage = false;
  let nearest = Infinity;

  for (const station of stations) {
    const stationPos = { lat: station.lat, lng: station.lng };
    // Measured over the ground covered this hour: at 6 kn the hourly samples are 6 NM
    // apart, so testing a 2 NM radius against a single instant misses the boat passing
    // straight through a gate between two ticks.
    const d = closestApproachToSegment(stationPos, position, nextPosition).distanceNm;
    if (d >= nearest) continue;
    nearest = d;
    const pred = predictions.get(station.id);
    if (!pred) continue;
    current = findCurrentAtTime(pred, timestamp);
    stationName = station.name;
    inCriticalPassage = !!station.critical && d <= 2;
  }

  return { current, stationName, inCriticalPassage };
}

export async function findBestWeatherWindow(
  route: Route,
  thresholds: WeatherThresholds,
  windyApiKey: string,
  destinations: Destination[],
  options: { daysAhead?: number; earliestHourOfDay?: number; latestHourOfDay?: number; stepHours?: number } = {}
): Promise<WeatherWindow[]> {
  const daysAhead = options.daysAhead ?? 7;
  const earliestHour = options.earliestHourOfDay ?? 6;
  const latestHour = options.latestHourOfDay ?? 14; // last reasonable start for a day sail
  const stepHours = options.stepHours ?? 3;

  const candidates: Date[] = [];
  const now = new Date();
  now.setMinutes(0, 0, 0);
  for (let d = 0; d < daysAhead; d++) {
    for (let h = earliestHour; h <= latestHour; h += stepHours) {
      const candidate = new Date(now);
      candidate.setDate(candidate.getDate() + d);
      candidate.setHours(h, 0, 0, 0);
      if (candidate.getTime() > Date.now()) candidates.push(candidate);
    }
  }

  // To save API calls, fetch forecasts ONCE for the route's sample points (they cover ~7 days)
  // and then evaluate each departure time locally
  const samplePoints: Position[] = [];
  const step = Math.max(1, Math.floor(route.waypoints.length / 3));
  for (let i = 0; i < route.waypoints.length; i += step) {
    samplePoints.push(route.waypoints[i].position);
  }
  const last = route.waypoints[route.waypoints.length - 1].position;
  samplePoints.push(last);

  const windForecasts = await Promise.all(
    samplePoints.map((p) => fetchWindyPointForecast(p, windyApiKey))
  );
  const midpoint = samplePoints[Math.floor(samplePoints.length / 2)];
  const waveForecast = await fetchWindyWaves(midpoint, windyApiKey).catch(() => null);

  // Currents across the whole candidate span, so a window is rated on the same inputs as
  // the detailed assessment of the same departure.
  const waypointPositions = route.waypoints.map((w) => w.position);
  const relevantStations = findRelevantCurrentStations(waypointPositions, 5);
  const spanEnd = new Date(
    (candidates[candidates.length - 1]?.getTime() ?? Date.now()) +
      (Math.ceil(route.totalEstimatedTimeHours) + 2) * 60 * 60 * 1000
  );
  const currentPredictions = new Map<string, CurrentPrediction>();
  await Promise.all(
    relevantStations.map(async (station) => {
      try {
        currentPredictions.set(
          station.id,
          await fetchCurrentPredictions(station, now, spanEnd)
        );
      } catch (err) {
        // Non-fatal, but the window will then be rated without current — same as before.
        console.warn(`Failed to fetch currents for ${station.name}:`, err);
      }
    })
  );

  const windows: WeatherWindow[] = candidates.map((departure) => {
    const totalHours = Math.ceil(route.totalEstimatedTimeHours);
    let maxWind = 0;
    let maxWave = 0;
    let hoursOfConcern = 0;
    let overall: SafetyRating = 'go';

    for (let h = 0; h <= totalHours; h++) {
      const ts = departure.getTime() + h * 60 * 60 * 1000;
      const { position } = positionAtHour(route, h);
      let bestForecast = windForecasts[0];
      let bestDist = distanceNM(samplePoints[0], position);
      for (let i = 1; i < samplePoints.length; i++) {
        const d = distanceNM(samplePoints[i], position);
        if (d < bestDist) {
          bestDist = d;
          bestForecast = windForecasts[i];
        }
      }
      const sources = [bestForecast];
      if (waveForecast) sources.push(waveForecast);
      const merged = mergeWindyForecasts(...sources);
      const point = findClosestHourly(merged, ts);
      if (!point) continue;

      const { current, stationName, inCriticalPassage } = currentForHour(
        route,
        relevantStations,
        currentPredictions,
        h,
        ts
      );
      const { overallRating } = assessHour({
        point,
        thresholds,
        current,
        currentStationName: stationName,
        inCriticalPassage,
      });
      if (point.windSpeedKnots) maxWind = Math.max(maxWind, point.windSpeedKnots);
      if (point.waveHeightFt) maxWave = Math.max(maxWave, point.waveHeightFt);
      if (overallRating !== 'go') hoursOfConcern++;
      overall = worstRating(overall, overallRating);
    }

    return {
      departureTime: departure.getTime(),
      rating: overall,
      score: hoursOfConcern * 10 + maxWind,
      maxWind,
      maxWave,
      hoursOfConcern,
    };
  });

  // Deterministic sort: score first, then by date (earliest first) as tiebreaker
  return windows.sort((a, b) => a.score - b.score || a.departureTime - b.departureTime);
  // suppress unused import warning
  void destinations;
}
