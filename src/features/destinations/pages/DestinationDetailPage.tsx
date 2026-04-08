import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Marker } from 'react-leaflet';
import L from 'leaflet';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  MapPin,
  Phone,
  Globe,
  Radio,
  Star,
  Check,
  Fuel,
  Droplets,
  Zap,
  ShowerHead,
  Wifi,
  Utensils,
} from 'lucide-react';
import { NauticalMap } from '../../../components/map/NauticalMap';
import { db } from '../../../db/database';
import type { Destination, DestinationType, Amenities } from '../../../types/destination';

const typeLabels: Record<DestinationType, string> = {
  marina: 'Marina',
  anchorage: 'Anchorage',
  mooring: 'Mooring Field',
  'yacht-club': 'Yacht Club',
  'town-dock': 'Town Dock',
};

const typeColors: Record<DestinationType, string> = {
  marina: 'bg-blue-500/10 text-blue-400',
  anchorage: 'bg-green-500/10 text-green-400',
  mooring: 'bg-purple-500/10 text-purple-400',
  'yacht-club': 'bg-amber-500/10 text-amber-400',
  'town-dock': 'bg-teal-500/10 text-teal-400',
};

const amenityIcons: Partial<Record<keyof Amenities, React.ElementType>> = {
  fuel: Fuel,
  water: Droplets,
  electric: Zap,
  showers: ShowerHead,
  wifi: Wifi,
  restaurant: Utensils,
};

const amenityLabels: Record<keyof Amenities, string> = {
  fuel: 'Fuel',
  water: 'Water',
  electric: 'Electric',
  pumpout: 'Pumpout',
  showers: 'Showers',
  laundry: 'Laundry',
  wifi: 'WiFi',
  restaurant: 'Restaurant',
  groceries: 'Groceries',
  repairs: 'Repairs',
  dinghyDock: 'Dinghy Dock',
  pool: 'Pool',
  ice: 'Ice',
  propane: 'Propane',
};

const pinIcon = new L.DivIcon({
  className: '',
  html: '<div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:9999px;border:3px solid #40c1d0;background:#40c1d0aa;"></div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

export function DestinationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [destination, setDestination] = useState<Destination | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    db.destinations.get(id).then((d) => {
      setDestination(d ?? null);
      setLoading(false);
    });
  }, [id]);

  const handleDelete = async () => {
    if (!destination) return;
    if (confirm(`Delete "${destination.name}"? This cannot be undone.`)) {
      await db.destinations.delete(destination.id);
      navigate('/destinations');
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-sea-400 border-t-transparent" />
      </div>
    );
  }

  if (!destination) {
    return (
      <div className="p-4">
        <p className="text-slate-400">Place not found</p>
        <Link to="/destinations" className="mt-4 inline-block text-sea-400">
          Back
        </Link>
      </div>
    );
  }

  const d = destination;
  const hasAnyAmenity = Object.values(d.amenities).some(Boolean);
  const avgRating =
    d.reviews.length > 0
      ? d.reviews.reduce((s, r) => s + r.rating, 0) / d.reviews.length
      : 0;

  return (
    <div>
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900 p-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/destinations')}
            className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-slate-100">{d.name}</h2>
            <div className="mt-0.5 flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${typeColors[d.type]}`}>
                {typeLabels[d.type]}
              </span>
              {avgRating > 0 && (
                <span className="flex items-center gap-0.5 text-xs text-amber-400">
                  <Star className="h-3 w-3 fill-current" />
                  {avgRating.toFixed(1)} ({d.reviews.length})
                </span>
              )}
            </div>
          </div>
          <Link
            to={`/destinations/${d.id}/edit`}
            className="flex items-center gap-1 rounded bg-sea-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sea-700"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Link>
        </div>
      </div>

      {/* Map */}
      <div className="h-52 border-b border-slate-800">
        <NauticalMap center={[d.position.lat, d.position.lng]} zoom={14}>
          <Marker position={[d.position.lat, d.position.lng]} icon={pinIcon} />
        </NauticalMap>
      </div>

      <div className="space-y-5 p-4">
        {d.description && (
          <p className="whitespace-pre-wrap text-sm text-slate-300">{d.description}</p>
        )}

        {/* Position & contact */}
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm">
          <div className="flex items-center gap-2 text-slate-400">
            <MapPin className="h-4 w-4" />
            <span className="font-mono text-xs">
              {d.position.lat.toFixed(5)}°, {d.position.lng.toFixed(5)}°
            </span>
          </div>
          {d.vhfChannel && (
            <div className="mt-2 flex items-center gap-2 text-slate-400">
              <Radio className="h-4 w-4" />
              <span>VHF Ch {d.vhfChannel}</span>
            </div>
          )}
          {d.phone && (
            <div className="mt-2 flex items-center gap-2 text-slate-400">
              <Phone className="h-4 w-4" />
              <a href={`tel:${d.phone}`} className="text-sea-400 hover:underline">
                {d.phone}
              </a>
            </div>
          )}
          {d.website && (
            <div className="mt-2 flex items-center gap-2 text-slate-400">
              <Globe className="h-4 w-4" />
              <a
                href={d.website}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate text-sea-400 hover:underline"
              >
                {d.website}
              </a>
            </div>
          )}
        </div>

        {/* Type-specific details */}
        {d.details.type === 'marina' && (d.type === 'marina' || d.type === 'yacht-club' || d.type === 'town-dock') && (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Marina Info
            </h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {d.details.slipCount !== undefined && (
                <div className="rounded bg-slate-800 p-2">
                  <div className="text-xs text-slate-500">Slips</div>
                  <div className="text-slate-100">{d.details.slipCount}</div>
                </div>
              )}
              {d.details.pricePerFoot !== undefined && (
                <div className="rounded bg-slate-800 p-2">
                  <div className="text-xs text-slate-500">Price/ft/night</div>
                  <div className="text-slate-100">${d.details.pricePerFoot}</div>
                </div>
              )}
              {d.details.maxLOA !== undefined && (
                <div className="rounded bg-slate-800 p-2">
                  <div className="text-xs text-slate-500">Max LOA</div>
                  <div className="text-slate-100">{d.details.maxLOA} ft</div>
                </div>
              )}
              {d.details.maxDraft !== undefined && (
                <div className="rounded bg-slate-800 p-2">
                  <div className="text-xs text-slate-500">Max Draft</div>
                  <div className="text-slate-100">{d.details.maxDraft} ft</div>
                </div>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {d.details.transientSlips && (
                <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-green-400">
                  Transient slips
                </span>
              )}
              {d.details.reservationRequired && (
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-400">
                  Reservation required
                </span>
              )}
            </div>
          </section>
        )}

        {d.details.type === 'anchorage' && (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Anchorage Info
            </h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded bg-slate-800 p-2">
                <div className="text-xs text-slate-500">Holding</div>
                <div className="capitalize text-slate-100">{d.details.holdingQuality}</div>
              </div>
              <div className="rounded bg-slate-800 p-2">
                <div className="text-xs text-slate-500">Bottom</div>
                <div className="text-slate-100">{d.details.bottomType}</div>
              </div>
              <div className="rounded bg-slate-800 p-2">
                <div className="text-xs text-slate-500">Depth</div>
                <div className="text-slate-100">{d.details.typicalDepthFeet} ft</div>
              </div>
              {d.details.swingRoomFeet && (
                <div className="rounded bg-slate-800 p-2">
                  <div className="text-xs text-slate-500">Swing Room</div>
                  <div className="text-slate-100">{d.details.swingRoomFeet} ft</div>
                </div>
              )}
            </div>
            {d.details.protectionFrom.length > 0 && (
              <div className="mt-2 text-xs text-slate-400">
                Protection from: <span className="text-green-400">{d.details.protectionFrom.join(', ')}</span>
              </div>
            )}
            {d.details.exposedTo.length > 0 && (
              <div className="mt-1 text-xs text-slate-400">
                Exposed to: <span className="text-amber-400">{d.details.exposedTo.join(', ')}</span>
              </div>
            )}
          </section>
        )}

        {d.details.type === 'mooring' && (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Mooring Info
            </h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {d.details.mooringCount !== undefined && (
                <div className="rounded bg-slate-800 p-2">
                  <div className="text-xs text-slate-500">Moorings</div>
                  <div className="text-slate-100">{d.details.mooringCount}</div>
                </div>
              )}
              {d.details.pricePerNight !== undefined && (
                <div className="rounded bg-slate-800 p-2">
                  <div className="text-xs text-slate-500">Price/Night</div>
                  <div className="text-slate-100">${d.details.pricePerNight}</div>
                </div>
              )}
              {d.details.maxLOA !== undefined && (
                <div className="rounded bg-slate-800 p-2">
                  <div className="text-xs text-slate-500">Max LOA</div>
                  <div className="text-slate-100">{d.details.maxLOA} ft</div>
                </div>
              )}
              {d.details.operator && (
                <div className="rounded bg-slate-800 p-2">
                  <div className="text-xs text-slate-500">Operator</div>
                  <div className="text-slate-100">{d.details.operator}</div>
                </div>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {d.details.launchService && (
                <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-blue-400">
                  Launch service
                </span>
              )}
              {d.details.reservationRequired && (
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-400">
                  Reservation required
                </span>
              )}
            </div>
          </section>
        )}

        {/* Amenities */}
        {hasAnyAmenity && (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Amenities
            </h3>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {(Object.keys(amenityLabels) as Array<keyof Amenities>).map((key) => {
                if (!d.amenities[key]) return null;
                const Icon = amenityIcons[key] ?? Check;
                return (
                  <div
                    key={key}
                    className="flex items-center gap-2 rounded bg-slate-800 px-3 py-1.5 text-xs text-slate-200"
                  >
                    <Icon className="h-3.5 w-3.5 text-sea-400" />
                    {amenityLabels[key]}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 rounded bg-red-500/10 px-3 py-2 text-sm font-medium text-red-400 hover:bg-red-500/20"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
