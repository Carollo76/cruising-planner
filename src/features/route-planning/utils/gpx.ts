import { v4 as uuid } from 'uuid';
import type { Route, Waypoint } from '../../../types/navigation';

/** Escape XML special characters */
function xmlEscape(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Convert a Route to GPX 1.1 XML string */
export function routeToGPX(route: Route): string {
  const now = new Date().toISOString();
  const name = xmlEscape(route.name);
  const desc = xmlEscape(route.description ?? '');

  const waypoints = route.waypoints
    .map(
      (wp) => `  <wpt lat="${wp.position.lat}" lon="${wp.position.lng}">
    <name>${xmlEscape(wp.name)}</name>
    <type>${wp.waypointType}</type>${wp.notes ? `\n    <desc>${xmlEscape(wp.notes)}</desc>` : ''}
  </wpt>`
    )
    .join('\n');

  const rtepts = route.waypoints
    .map(
      (wp) => `    <rtept lat="${wp.position.lat}" lon="${wp.position.lng}">
      <name>${xmlEscape(wp.name)}</name>
    </rtept>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Cruising Planner" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${name}</name>
    <desc>${desc}</desc>
    <time>${now}</time>
  </metadata>
${waypoints}
  <rte>
    <name>${name}</name>
    <desc>${desc}</desc>
${rtepts}
  </rte>
</gpx>`;
}

/** Parse GPX XML string into waypoints for a new route */
export function parseGPX(xmlString: string): { name: string; waypoints: Waypoint[] } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) throw new Error('Invalid GPX file');

  // Try to get route name from metadata or route
  const metadataName = doc.querySelector('metadata > name')?.textContent;
  const routeName = doc.querySelector('rte > name')?.textContent;
  const name = metadataName || routeName || 'Imported Route';

  const routeId = uuid();
  const waypoints: Waypoint[] = [];

  // Prefer <rtept> (route points) — they're ordered
  const rteptNodes = Array.from(doc.querySelectorAll('rtept'));

  if (rteptNodes.length > 0) {
    rteptNodes.forEach((node, i) => {
      const lat = parseFloat(node.getAttribute('lat') ?? '0');
      const lng = parseFloat(node.getAttribute('lon') ?? '0');
      const wpName = node.querySelector('name')?.textContent ?? `WP${i + 1}`;
      waypoints.push({
        id: uuid(),
        routeId,
        position: { lat, lng },
        name: wpName,
        sequenceOrder: i,
        waypointType: i === 0 ? 'departure' : i === rteptNodes.length - 1 ? 'destination' : 'waypoint',
      });
    });
  } else {
    // Fallback to <wpt> nodes
    const wptNodes = Array.from(doc.querySelectorAll('wpt'));
    wptNodes.forEach((node, i) => {
      const lat = parseFloat(node.getAttribute('lat') ?? '0');
      const lng = parseFloat(node.getAttribute('lon') ?? '0');
      const wpName = node.querySelector('name')?.textContent ?? `WP${i + 1}`;
      const notes = node.querySelector('desc')?.textContent ?? undefined;
      waypoints.push({
        id: uuid(),
        routeId,
        position: { lat, lng },
        name: wpName,
        sequenceOrder: i,
        waypointType: i === 0 ? 'departure' : i === wptNodes.length - 1 ? 'destination' : 'waypoint',
        notes,
      });
    });
  }

  return { name, waypoints };
}

/** Trigger a browser download of a GPX file */
export function downloadGPX(route: Route): void {
  const xml = routeToGPX(route);
  const blob = new Blob([xml], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${route.name.replace(/[^a-z0-9]/gi, '_')}.gpx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
