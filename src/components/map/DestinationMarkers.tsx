import { useMemo } from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { Link } from 'react-router-dom';
import type { Destination, DestinationType } from '../../types/destination';

/** Type → color mapping for map icons */
const TYPE_STYLES: Record<
  DestinationType,
  { color: string; bg: string; glyph: string; label: string }
> = {
  marina: { color: '#60a5fa', bg: '#1e3a8a', glyph: 'M', label: 'Marina' },
  anchorage: { color: '#4ade80', bg: '#14532d', glyph: '⚓', label: 'Anchorage' },
  mooring: { color: '#c084fc', bg: '#4c1d95', glyph: '○', label: 'Mooring' },
  'yacht-club': { color: '#fbbf24', bg: '#78350f', glyph: 'Y', label: 'Yacht Club' },
  'town-dock': { color: '#2dd4bf', bg: '#134e4a', glyph: 'D', label: 'Town Dock' },
};

/** Create a Leaflet DivIcon for a destination type */
function makeDestinationIcon(type: DestinationType): L.DivIcon {
  const style = TYPE_STYLES[type];
  return new L.DivIcon({
    className: '',
    html: `<div style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:9999px;border:2px solid ${style.color};background:${style.bg};color:${style.color};font-size:11px;font-weight:700;box-shadow:0 1px 4px rgba(0,0,0,0.6);line-height:1;">${style.glyph}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -12],
  });
}

interface DestinationMarkersProps {
  destinations: Destination[];
  /** Optional filter — if provided, only these types are shown */
  visibleTypes?: Set<DestinationType>;
}

export function DestinationMarkers({ destinations, visibleTypes }: DestinationMarkersProps) {
  // Cache icons so we don't recreate one per marker
  const icons = useMemo(() => {
    const map: Record<string, L.DivIcon> = {};
    (Object.keys(TYPE_STYLES) as DestinationType[]).forEach((t) => {
      map[t] = makeDestinationIcon(t);
    });
    return map;
  }, []);

  const filtered = visibleTypes
    ? destinations.filter((d) => visibleTypes.has(d.type))
    : destinations;

  return (
    <>
      {filtered.map((d) => (
        <Marker
          key={d.id}
          position={[d.position.lat, d.position.lng]}
          icon={icons[d.type]}
        >
          <Popup>
            <div className="min-w-[180px]">
              <div className="font-semibold text-slate-900">{d.name}</div>
              <div className="mt-0.5 text-xs capitalize text-slate-600">
                {TYPE_STYLES[d.type].label}
              </div>
              {d.description && (
                <p className="mt-1 line-clamp-2 text-xs text-slate-700">{d.description}</p>
              )}
              <Link
                to={`/planner/destinations/${d.id}`}
                className="mt-2 inline-block text-xs font-medium text-sea-700 hover:underline"
              >
                View details →
              </Link>
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  );
}

export { TYPE_STYLES as DESTINATION_TYPE_STYLES };
