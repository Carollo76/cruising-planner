/**
 * Regenerates src/data/current-stations.json from the NOAA CO-OPS metadata API.
 *
 * The full metadata payload is ~3.9 MB; trimmed to the fields the planner needs it is
 * ~229 KB (56 KB gzipped), which is small enough to ship so gate matching works offline
 * from first launch with no fetch. Checked in rather than fetched at runtime for exactly
 * that reason.
 *
 * Run:  node scripts/build-current-stations.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const URL_ =
  'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=currentpredictions&units=english';

const resp = await fetch(URL_);
if (!resp.ok) throw new Error(`NOAA metadata fetch failed: ${resp.status}`);
const { stations } = await resp.json();

/** One entry per station, collecting its depth bins. */
const byId = new Map();
for (const s of stations) {
  const existing = byId.get(s.id);
  if (existing) {
    if (s.currbin != null && !existing.bins.includes(s.currbin)) existing.bins.push(s.currbin);
    continue;
  }
  byId.set(s.id, {
    id: s.id,
    name: s.name,
    lat: Number(s.lat.toFixed(4)),
    lng: Number(s.lng.toFixed(4)),
    bins: s.currbin != null ? [s.currbin] : [],
    // 'H' = harmonic (full predictions), 'S' = subordinate (offsets from a reference)
    type: s.type ?? null,
  });
}

const out = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
for (const s of out) s.bins.sort((a, b) => a - b);

const json = JSON.stringify(
  { generatedAt: new Date().toISOString(), source: URL_, stations: out },
  null,
  0
);

mkdirSync('src/data', { recursive: true });
writeFileSync('src/data/current-stations.json', json + '\n');

console.log(
  `wrote ${out.length} stations — ${Math.round(json.length / 1024)} KB raw, ` +
    `${Math.round(gzipSync(json).length / 1024)} KB gzipped`
);
