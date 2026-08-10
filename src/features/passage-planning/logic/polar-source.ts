import { parsePolarCsv, type Polar } from './polar';

/**
 * Which polar the app uses.
 *
 * One seed file is shipped today — the 1.41 m shoal certificate, which is this boat.
 * The loader is deliberately multi-file so a deep-draft polar can be added later as data
 * alone, and so a user-edited or fitted polar can supersede the seed without any change
 * here beyond another entry.
 */

export interface PolarSource {
  id: string;
  name: string;
  draftMetres: number;
  /** Dynamically imported so polar data stays out of the initial bundle. */
  load: () => Promise<string>;
}

export const POLAR_SOURCES: PolarSource[] = [
  {
    id: 'oceanis-37-shoal-1.41m',
    name: 'Beneteau Oceanis 37 — shoal keel (1.41 m)',
    draftMetres: 1.41,
    load: async () =>
      (await import('../../../data/polars/oceanis-37-shoal-1.41m.csv?raw')).default,
  },
];

/** Metres per foot, for matching a boat's draft against the available certificates. */
const FEET_PER_METRE = 3.28084;

/**
 * Picks the polar closest to the boat's draft.
 *
 * Returns null when nothing is within half a metre rather than serving a mismatched
 * certificate: the deep and shoal versions of this design differ meaningfully upwind, so
 * the wrong one is not a small error.
 */
export function sourceForDraft(draftFt: number): PolarSource | null {
  const draftMetres = draftFt / FEET_PER_METRE;
  let best: { source: PolarSource; delta: number } | null = null;

  for (const source of POLAR_SOURCES) {
    const delta = Math.abs(source.draftMetres - draftMetres);
    if (!best || delta < best.delta) best = { source, delta };
  }

  if (!best || best.delta > 0.5) return null;
  return best.source;
}

let cached: Polar | null = null;
let cachedId: string | null = null;

/** Loads and parses the polar for a boat, or null when none matches its draft. */
export async function loadPolarForDraft(draftFt: number): Promise<Polar | null> {
  const source = sourceForDraft(draftFt);
  if (!source) return null;
  if (cached && cachedId === source.id) return cached;

  const csv = await source.load();
  cached = parsePolarCsv(csv, {
    id: source.id,
    name: source.name,
    source: 'seed',
    draftMetres: source.draftMetres,
    version: 1,
    updatedAt: Date.now(),
  });
  cachedId = source.id;
  return cached;
}
