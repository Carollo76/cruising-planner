import type { Position } from '../types/navigation';
import { distanceNM } from '../utils/navigation-math';

/**
 * Charted depths from NOAA's Electronic Navigational Charts.
 *
 * This exists so entrance depths do not have to be typed in by hand for every harbour.
 * It looks the numbers up; it deliberately does not decide them. The minimum sounding
 * inside a search radius is not the same thing as a channel's controlling depth — the
 * radius includes water beside the channel, and a boat does not sail through the middle
 * of a shoal — so the result is presented for the skipper to choose from, with its survey
 * date, rather than written into the record automatically.
 *
 * S-57 depths are metres below chart datum (MLLW for US charts).
 */

const ENC_HARBOUR =
  'https://gis.charttools.noaa.gov/arcgis/rest/services/encdirect/enc_harbour/MapServer';

/** Spot soundings. */
const SOUNDING_LAYER = 76;
/** Depth areas, carrying a min (DRVAL1) and max (DRVAL2) depth. */
const DEPTH_AREA_LAYER = 227;

const FEET_PER_METRE = 3.28084;

interface EsriSoundingFeature {
  attributes: { Z?: number; SORDAT?: string | number; QUASOU?: string | number };
  geometry?: { x: number; y: number };
}

interface EsriDepthAreaFeature {
  attributes: { DRVAL1?: number; DRVAL2?: number; SORDAT?: string | number };
}

interface EsriResponse<T> {
  features?: T[];
  error?: { message?: string };
}

export interface ChartedSounding {
  depthFt: number;
  position: Position;
  distanceNm: number;
  /** Survey date as `YYYY-MM-DD`, when NOAA supplies one. */
  surveyedOn: string | null;
}

export interface ChartedDepthArea {
  /** Shallowest depth in the area, feet below datum. Negative means it dries. */
  minDepthFt: number;
  maxDepthFt: number | null;
  surveyedOn: string | null;
}

export interface ChartedDepths {
  centre: Position;
  radiusNm: number;
  soundings: ChartedSounding[];
  depthAreas: ChartedDepthArea[];
  /** Oldest survey date among the results — charts shoal between surveys. */
  oldestSurvey: string | null;
}

export class ChartDepthError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = 'ChartDepthError';
    this.retryable = retryable;
  }
}

/** NOAA gives dates as YYYYMMDD integers. */
function parseSurveyDate(raw: string | number | undefined): string | null {
  if (raw === undefined || raw === null) return null;
  const text = String(raw);
  if (!/^\d{8}$/.test(text)) return null;
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

function metresToFeet(metres: number): number {
  return Math.round(metres * FEET_PER_METRE * 10) / 10;
}

/** Envelope of roughly `radiusNm` around a position, in degrees. */
export function boundingBox(centre: Position, radiusNm: number): string {
  const dLat = radiusNm / 60;
  const dLon = dLat / Math.max(0.2, Math.cos((centre.lat * Math.PI) / 180));
  return [centre.lng - dLon, centre.lat - dLat, centre.lng + dLon, centre.lat + dLat].join(',');
}

/** Exported for tests, which drive it from captured responses rather than the network. */
export function parseChartedDepths(
  soundingBody: EsriResponse<EsriSoundingFeature>,
  depthAreaBody: EsriResponse<EsriDepthAreaFeature>,
  centre: Position,
  radiusNm: number
): ChartedDepths {
  if (soundingBody.error?.message || depthAreaBody.error?.message) {
    throw new ChartDepthError(
      `NOAA charts: ${soundingBody.error?.message ?? depthAreaBody.error?.message}`,
      false
    );
  }

  const soundings: ChartedSounding[] = [];
  for (const feature of soundingBody.features ?? []) {
    const z = feature.attributes.Z;
    if (typeof z !== 'number' || !Number.isFinite(z)) continue;
    const position = feature.geometry
      ? { lat: feature.geometry.y, lng: feature.geometry.x }
      : centre;
    soundings.push({
      depthFt: metresToFeet(z),
      position,
      distanceNm: distanceNM(centre, position),
      surveyedOn: parseSurveyDate(feature.attributes.SORDAT),
    });
  }

  const depthAreas: ChartedDepthArea[] = [];
  for (const feature of depthAreaBody.features ?? []) {
    const min = feature.attributes.DRVAL1;
    if (typeof min !== 'number' || !Number.isFinite(min)) continue;
    const max = feature.attributes.DRVAL2;
    depthAreas.push({
      minDepthFt: metresToFeet(min),
      maxDepthFt: typeof max === 'number' && Number.isFinite(max) ? metresToFeet(max) : null,
      surveyedOn: parseSurveyDate(feature.attributes.SORDAT),
    });
  }

  const dates = [...soundings, ...depthAreas]
    .map((r) => r.surveyedOn)
    .filter((d): d is string => d !== null)
    .sort();

  return {
    centre,
    radiusNm,
    soundings: soundings.sort((a, b) => a.depthFt - b.depthFt),
    depthAreas: depthAreas.sort((a, b) => a.minDepthFt - b.minDepthFt),
    oldestSurvey: dates[0] ?? null,
  };
}

export async function fetchChartedDepths(
  centre: Position,
  radiusNm = 0.25
): Promise<ChartedDepths> {
  const geometry = boundingBox(centre, radiusNm);
  const common =
    `geometry=${geometry}&geometryType=esriGeometryEnvelope&inSR=4326` +
    `&spatialRel=esriSpatialRelIntersects&outFields=*&f=json`;

  const request = async (layer: number, withGeometry: boolean) => {
    let response: Response;
    try {
      response = await fetch(
        `${ENC_HARBOUR}/${layer}/query?${common}&returnGeometry=${withGeometry}`
      );
    } catch (err) {
      throw new ChartDepthError(`Could not reach NOAA charts: ${(err as Error).message}`, true);
    }
    if (response.status >= 400 && response.status < 500) {
      throw new ChartDepthError(`NOAA charts rejected the request (${response.status})`, false);
    }
    if (!response.ok) {
      throw new ChartDepthError(`NOAA charts returned ${response.status}`, true);
    }
    return response.json();
  };

  const [soundings, areas] = await Promise.all([
    request(SOUNDING_LAYER, true) as Promise<EsriResponse<EsriSoundingFeature>>,
    request(DEPTH_AREA_LAYER, false) as Promise<EsriResponse<EsriDepthAreaFeature>>,
  ]);

  return parseChartedDepths(soundings, areas, centre, radiusNm);
}

/**
 * The shallowest sounding a boat could plausibly meet on the way in.
 *
 * Drying and near-zero soundings are excluded: they are the beach and the mud beside the
 * channel, not the approach, and including them would suggest every harbour is unusable.
 * This is still a candidate for the skipper to accept, not an answer.
 */
export function shallowestNavigable(depths: ChartedDepths, minimumFt = 1): ChartedSounding | null {
  return depths.soundings.find((s) => s.depthFt >= minimumFt) ?? null;
}

/** A source note that records where the number came from and when it was surveyed. */
export function sourceNoteFor(depths: ChartedDepths): string {
  const surveyed = depths.oldestSurvey ? `, surveyed ${depths.oldestSurvey}` : '';
  return `NOAA ENC, within ${depths.radiusNm.toFixed(2)} NM${surveyed}`;
}
