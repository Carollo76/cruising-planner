/**
 * Regenerates the bundled NOAA station catalogues from the CO-OPS metadata API.
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

const CURRENTS_URL =
  'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=currentpredictions&units=english';
const TIDES_URL =
  'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions&units=english';

async function fetchStations(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`NOAA metadata fetch failed: ${resp.status}`);
  return (await resp.json()).stations;
}

const stations = await fetchStations(CURRENTS_URL);

/** One entry per station, collecting its depth bins. */
const byId = new Map();
for (const s of stations) {
  const existing = byId.get(s.id);
  if (existing) {
    if (s.currbin != null && !existing.bins.some((b) => b.bin === s.currbin)) {
      existing.bins.push({ bin: s.currbin, depthFt: s.depth ?? null });
    }
    continue;
  }
  byId.set(s.id, {
    id: s.id,
    name: s.name,
    lat: Number(s.lat.toFixed(4)),
    lng: Number(s.lng.toFixed(4)),
    // Depth per bin, because bin numbers run bottom-up: bin 1 is the DEEPEST reading at
    // a station, not the surface. Choosing by number rather than depth had every gate
    // reporting the water 150 ft down instead of the water the keel is in.
    bins: s.currbin != null ? [{ bin: s.currbin, depthFt: s.depth ?? null }] : [],
    // 'H' = harmonic (full predictions), 'S' = subordinate (offsets from a reference)
    type: s.type ?? null,
  });
}

const out = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
for (const s of out) s.bins.sort((a, b) => (a.depthFt ?? 1e9) - (b.depthFt ?? 1e9));

const json = JSON.stringify(
  { generatedAt: new Date().toISOString(), source: CURRENTS_URL, stations: out },
  null,
  0
);

mkdirSync('src/data', { recursive: true });
writeFileSync('src/data/current-stations.json', json + '\n');

console.log(
  `current-stations.json: ${out.length} stations — ${Math.round(json.length / 1024)} KB raw, ` +
    `${Math.round(gzipSync(json).length / 1024)} KB gzipped`
);

// Tide stations, for water level at a harbour entrance. Same reasoning as currents:
// bundled so depth checks work offline, generated so nobody hand-copies an id.
const tideStations = (await fetchStations(TIDES_URL))
  .map((s) => ({
    id: s.id,
    name: s.name,
    lat: Number(s.lat.toFixed(4)),
    lng: Number(s.lng.toFixed(4)),
  }))
  .sort((a, b) => a.id.localeCompare(b.id));

const tideJson = JSON.stringify(
  { generatedAt: new Date().toISOString(), source: TIDES_URL, stations: tideStations },
  null,
  0
);
writeFileSync('src/data/tide-stations.json', tideJson + '\n');
console.log(
  `tide-stations.json: ${tideStations.length} stations — ${Math.round(tideJson.length / 1024)} KB raw, ` +
    `${Math.round(gzipSync(tideJson).length / 1024)} KB gzipped`
);
