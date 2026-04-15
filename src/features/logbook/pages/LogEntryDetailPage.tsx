import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Marker } from 'react-leaflet';
import L from 'leaflet';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  MapPin,
  Clock,
  Navigation as NavIcon,
  Gauge,
  Wind,
  Thermometer,
  Eye,
  Camera,
  X,
  User,
} from 'lucide-react';
import { format } from 'date-fns';
import { NauticalMap } from '../../../components/map/NauticalMap';
import { db } from '../../../db/database';
import type { LogEntry } from '../../../types/logbook';
import type { Trip } from '../../../types/navigation';

const ENTRY_BADGE_COLORS: Record<LogEntry['entryType'], string> = {
  departure: 'bg-green-500/15 text-green-400',
  arrival: 'bg-blue-500/15 text-blue-400',
  incident: 'bg-red-500/15 text-red-400',
  'weather-change': 'bg-amber-500/15 text-amber-400',
  'position-fix': 'bg-slate-500/15 text-slate-300',
  'watch-change': 'bg-slate-500/15 text-slate-300',
  regular: 'bg-slate-500/15 text-slate-300',
};

const ENTRY_TYPE_LABELS: Record<LogEntry['entryType'], string> = {
  regular: 'Regular',
  departure: 'Departure',
  arrival: 'Arrival',
  'position-fix': 'Position Fix',
  'weather-change': 'Weather Change',
  incident: 'Incident',
  'watch-change': 'Watch Change',
};

const pinIcon = new L.DivIcon({
  className: '',
  html: `<div style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:9999px;border:2px solid #40c1d0;background:rgba(64,193,208,0.35);color:#fff;font-size:11px;font-weight:700;">L</div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

function formatLat(lat: number): string {
  const dir = lat >= 0 ? 'N' : 'S';
  return `${Math.abs(lat).toFixed(4)}°${dir}`;
}
function formatLng(lng: number): string {
  const dir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lng).toFixed(4)}°${dir}`;
}

export function LogEntryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [entry, setEntry] = useState<LogEntry | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const e = await db.logEntries.get(id);
      if (!e) {
        setLoading(false);
        return;
      }
      setEntry(e);
      const t = await db.trips.get(e.tripId);
      setTrip(t ?? null);
      setLoading(false);
    })();
  }, [id]);

  const handleDelete = async () => {
    if (!entry) return;
    if (confirm('Delete this log entry? This cannot be undone.')) {
      await db.logEntries.delete(entry.id);
      navigate('/planner/logbook');
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-sea-400 border-t-transparent" />
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="p-4">
        <Link to="/planner/logbook" className="inline-flex items-center gap-1 text-sea-400">
          <ArrowLeft className="h-4 w-4" />
          Back to Logbook
        </Link>
        <p className="mt-4 text-slate-400">Log entry not found.</p>
      </div>
    );
  }

  const pos = entry.position;

  return (
    <div>
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900 p-4">
        <div className="flex items-center gap-2">
          <Link
            to="/planner/logbook"
            className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-100">
                {ENTRY_TYPE_LABELS[entry.entryType]}
              </h2>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${ENTRY_BADGE_COLORS[entry.entryType]}`}
              >
                {entry.entryType.replace('-', ' ')}
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
              <Clock className="h-3 w-3" />
              {format(new Date(entry.timestamp), 'EEE, MMM d, yyyy HH:mm')}
              {trip && <span className="ml-2 text-slate-500">· {trip.name}</span>}
            </div>
          </div>
          <Link
            to={`/planner/logbook/${entry.id}/edit`}
            className="flex items-center gap-1 rounded bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-700"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Link>
        </div>
      </div>

      <div className="space-y-5 p-4">
        {/* Map */}
        {pos && (
          <section>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
              Position
            </h3>
            <div className="h-64 overflow-hidden rounded-lg border border-slate-800">
              <NauticalMap center={[pos.lat, pos.lng]} zoom={12}>
                <Marker position={[pos.lat, pos.lng]} icon={pinIcon} />
              </NauticalMap>
            </div>
            <div className="mt-2 flex items-center gap-1 text-sm text-sea-400">
              <MapPin className="h-4 w-4" />
              {formatLat(pos.lat)}, {formatLng(pos.lng)}
              <span className="ml-2 text-xs text-slate-500">({entry.positionSource})</span>
            </div>
          </section>
        )}

        {/* Course & speed */}
        {(entry.courseOverGround !== undefined ||
          entry.speedOverGround !== undefined ||
          entry.heading !== undefined ||
          entry.engineHours !== undefined ||
          entry.engineRunning) && (
          <section>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
              Course & Speed
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {entry.courseOverGround !== undefined && (
                <Stat icon={NavIcon} label="COG" value={`${entry.courseOverGround.toFixed(0)}°`} />
              )}
              {entry.speedOverGround !== undefined && (
                <Stat icon={Gauge} label="SOG" value={`${entry.speedOverGround.toFixed(1)} kt`} />
              )}
              {entry.heading !== undefined && (
                <Stat icon={NavIcon} label="Heading" value={`${entry.heading.toFixed(0)}°`} />
              )}
              {entry.engineHours !== undefined && (
                <Stat icon={Gauge} label="Engine hrs" value={entry.engineHours.toFixed(1)} />
              )}
            </div>
            {entry.engineRunning && (
              <p className="mt-2 text-xs text-amber-400">Engine was running</p>
            )}
          </section>
        )}

        {/* Weather */}
        {(entry.windSpeed !== undefined ||
          entry.windDirection !== undefined ||
          entry.seaState ||
          entry.visibility ||
          entry.barometer !== undefined ||
          entry.temperature !== undefined ||
          entry.weatherNotes) && (
          <section>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
              Weather
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {entry.windSpeed !== undefined && (
                <Stat
                  icon={Wind}
                  label="Wind"
                  value={`${entry.windSpeed.toFixed(1)} kt${
                    entry.windDirection !== undefined ? ` @ ${entry.windDirection.toFixed(0)}°` : ''
                  }`}
                />
              )}
              {entry.seaState && (
                <Stat icon={Wind} label="Sea state" value={entry.seaState.replace('-', ' ')} />
              )}
              {entry.visibility && <Stat icon={Eye} label="Visibility" value={entry.visibility} />}
              {entry.barometer !== undefined && (
                <Stat
                  icon={Thermometer}
                  label="Barometer"
                  value={`${entry.barometer.toFixed(2)} inHg`}
                />
              )}
              {entry.temperature !== undefined && (
                <Stat
                  icon={Thermometer}
                  label="Temp"
                  value={`${entry.temperature.toFixed(0)}°F`}
                />
              )}
            </div>
            {entry.weatherNotes && (
              <p className="mt-2 text-sm text-slate-300 whitespace-pre-wrap">{entry.weatherNotes}</p>
            )}
          </section>
        )}

        {/* Notes */}
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
            Notes
          </h3>
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
            <p className="whitespace-pre-wrap text-sm text-slate-200">{entry.notes}</p>
          </div>
        </section>

        {/* Created by */}
        {entry.createdBy && (
          <section>
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <User className="h-4 w-4" />
              Recorded by <span className="text-slate-200">{entry.createdBy}</span>
            </div>
          </section>
        )}

        {/* Photos */}
        {entry.photos && entry.photos.length > 0 && (
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
              <Camera className="h-4 w-4" />
              Photos ({entry.photos.length})
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {entry.photos.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setLightbox(p.data)}
                  className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900 transition-opacity hover:opacity-90"
                >
                  <img src={p.data} alt={p.caption ?? ''} className="h-32 w-full object-cover" />
                  {p.caption && (
                    <p className="p-2 text-left text-xs text-slate-400">{p.caption}</p>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Delete */}
        <section className="border-t border-slate-800 pt-4">
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/20"
          >
            <Trash2 className="h-4 w-4" />
            Delete Entry
          </button>
        </section>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={() => setLightbox(null)}
            className="absolute right-4 top-4 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={lightbox}
            alt=""
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
      <div className="flex items-center gap-1 text-xs text-slate-500">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold capitalize text-slate-100">{value}</div>
    </div>
  );
}
