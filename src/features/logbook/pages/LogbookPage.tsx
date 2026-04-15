import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  Plus,
  MapPin,
  Clock,
  Navigation,
  Gauge,
  Camera,
  Download,
} from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { db } from '../../../db/database';
import type { LogEntry } from '../../../types/logbook';
import type { Trip } from '../../../types/navigation';

type EntryType = LogEntry['entryType'];

const ENTRY_TYPES: Array<'all' | EntryType> = [
  'all',
  'departure',
  'arrival',
  'weather-change',
  'incident',
  'position-fix',
  'watch-change',
  'regular',
];

const ENTRY_LABELS: Record<'all' | EntryType, string> = {
  all: 'All',
  regular: 'Regular',
  departure: 'Departure',
  arrival: 'Arrival',
  'position-fix': 'Position',
  'weather-change': 'Weather',
  incident: 'Incident',
  'watch-change': 'Watch',
};

const ENTRY_BADGE_COLORS: Record<EntryType, string> = {
  departure: 'bg-green-500/15 text-green-400',
  arrival: 'bg-blue-500/15 text-blue-400',
  incident: 'bg-red-500/15 text-red-400',
  'weather-change': 'bg-amber-500/15 text-amber-400',
  'position-fix': 'bg-slate-500/15 text-slate-300',
  'watch-change': 'bg-slate-500/15 text-slate-300',
  regular: 'bg-slate-500/15 text-slate-300',
};

function formatLat(lat: number): string {
  const dir = lat >= 0 ? 'N' : 'S';
  return `${Math.abs(lat).toFixed(4)}°${dir}`;
}

function formatLng(lng: number): string {
  const dir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lng).toFixed(4)}°${dir}`;
}

function dateHeading(ts: number): string {
  const d = new Date(ts);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'EEEE, MMM d, yyyy');
}

function dateKey(ts: number): string {
  return format(new Date(ts), 'yyyy-MM-dd');
}

function csvEscape(value: unknown): string {
  if (value === undefined || value === null) return '';
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function LogbookPage() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [filterTripId, setFilterTripId] = useState<string>('all');
  const [filterType, setFilterType] = useState<'all' | EntryType>('all');

  useEffect(() => {
    (async () => {
      const [allEntries, allTrips] = await Promise.all([
        db.logEntries.orderBy('timestamp').reverse().toArray(),
        db.trips.toArray(),
      ]);
      setEntries(allEntries);
      setTrips(allTrips);
    })();
  }, []);

  const tripMap = useMemo(() => new Map(trips.map((t) => [t.id, t])), [trips]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (filterTripId !== 'all' && e.tripId !== filterTripId) return false;
      if (filterType !== 'all' && e.entryType !== filterType) return false;
      return true;
    });
  }, [entries, filterTripId, filterType]);

  const grouped = useMemo(() => {
    const map = new Map<string, { heading: string; entries: LogEntry[] }>();
    filtered.forEach((e) => {
      const key = dateKey(e.timestamp);
      if (!map.has(key)) {
        map.set(key, { heading: dateHeading(e.timestamp), entries: [] });
      }
      map.get(key)!.entries.push(e);
    });
    return Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([, v]) => v);
  }, [filtered]);

  const handleExportCsv = () => {
    const header = [
      'timestamp_iso',
      'trip_name',
      'entry_type',
      'lat',
      'lng',
      'position_source',
      'course_deg',
      'speed_kt',
      'heading',
      'engine_hours',
      'engine_running',
      'wind_speed_kt',
      'wind_direction_deg',
      'sea_state',
      'visibility',
      'barometer_inhg',
      'temp_f',
      'weather_notes',
      'notes',
      'created_by',
      'photo_count',
    ];
    const rows = entries.map((e) => [
      new Date(e.timestamp).toISOString(),
      tripMap.get(e.tripId)?.name ?? '',
      e.entryType,
      e.position?.lat ?? '',
      e.position?.lng ?? '',
      e.positionSource,
      e.courseOverGround ?? '',
      e.speedOverGround ?? '',
      e.heading ?? '',
      e.engineHours ?? '',
      e.engineRunning ? 'yes' : 'no',
      e.windSpeed ?? '',
      e.windDirection ?? '',
      e.seaState ?? '',
      e.visibility ?? '',
      e.barometer ?? '',
      e.temperature ?? '',
      e.weatherNotes ?? '',
      e.notes ?? '',
      e.createdBy ?? '',
      e.photos?.length ?? 0,
    ]);
    const csv = [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logbook-export-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Logbook</h2>
        <div className="flex gap-2">
          <button
            onClick={handleExportCsv}
            disabled={entries.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-200 hover:border-slate-600 disabled:opacity-40"
          >
            <Download className="h-4 w-4" />
            Export All
          </button>
          <Link
            to="/planner/logbook/new"
            className="flex items-center gap-1.5 rounded-lg bg-sea-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-sea-700"
          >
            <Plus className="h-4 w-4" />
            New Entry
          </Link>
        </div>
      </div>

      {/* Trip filter */}
      <div className="mb-3">
        <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-500">
          Trip
        </label>
        <select
          value={filterTripId}
          onChange={(e) => setFilterTripId(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-slate-100 focus:border-sea-500 focus:outline-none"
        >
          <option value="all">All Trips</option>
          {trips.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {/* Entry type tabs */}
      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        {ENTRY_TYPES.map((et) => (
          <button
            key={et}
            onClick={() => setFilterType(et)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              filterType === et
                ? 'bg-sea-600 text-white'
                : 'border border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600'
            }`}
          >
            {ENTRY_LABELS[et]}
          </button>
        ))}
      </div>

      {entries.length === 0 ? (
        <div className="mt-12 text-center text-slate-400">
          <BookOpen className="mx-auto mb-3 h-12 w-12 opacity-50" />
          <p className="text-lg">No log entries yet</p>
          <p className="mt-1 text-sm">Start recording your voyage</p>
          <Link
            to="/planner/logbook/new"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-sea-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-sea-700"
          >
            <Plus className="h-4 w-4" />
            New Entry
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-8 text-center text-slate-400">
          <p className="text-sm">No entries match the current filters.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map((group, gi) => (
            <div key={gi}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                {group.heading}
              </h3>
              <div className="space-y-2">
                {group.entries.map((entry) => {
                  const trip = tripMap.get(entry.tripId);
                  const firstPhoto = entry.photos?.[0];
                  const more = Math.max(0, (entry.photos?.length ?? 0) - 1);
                  return (
                    <Link
                      key={entry.id}
                      to={`/planner/logbook/${entry.id}`}
                      className="block rounded-lg border border-slate-800 bg-slate-900 p-3 transition-colors hover:border-slate-700"
                    >
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(entry.timestamp), 'HH:mm')} ·{' '}
                          {format(new Date(entry.timestamp), 'MMM d, yyyy')}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${ENTRY_BADGE_COLORS[entry.entryType]}`}
                        >
                          {entry.entryType.replace('-', ' ')}
                        </span>
                      </div>

                      {filterTripId === 'all' && trip && (
                        <div className="mt-1 text-xs text-slate-400">{trip.name}</div>
                      )}

                      {entry.position && (
                        <div className="mt-1 flex items-center gap-1 text-xs text-sea-400">
                          <MapPin className="h-3 w-3" />
                          {formatLat(entry.position.lat)}, {formatLng(entry.position.lng)}
                        </div>
                      )}

                      {(entry.courseOverGround !== undefined || entry.speedOverGround !== undefined) && (
                        <div className="mt-1 flex items-center gap-3 text-xs text-slate-400">
                          {entry.courseOverGround !== undefined && (
                            <span className="flex items-center gap-1">
                              <Navigation className="h-3 w-3" />
                              {entry.courseOverGround.toFixed(0)}°
                            </span>
                          )}
                          {entry.speedOverGround !== undefined && (
                            <span className="flex items-center gap-1">
                              <Gauge className="h-3 w-3" />
                              {entry.speedOverGround.toFixed(1)} kt
                            </span>
                          )}
                        </div>
                      )}

                      <div className="mt-2 flex gap-2">
                        {firstPhoto && (
                          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded border border-slate-700">
                            <img
                              src={firstPhoto.data}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                            {more > 0 && (
                              <div className="absolute bottom-0 right-0 flex items-center gap-0.5 rounded-tl bg-black/70 px-1 py-0.5 text-[10px] text-white">
                                <Camera className="h-2.5 w-2.5" />+{more}
                              </div>
                            )}
                          </div>
                        )}
                        {entry.notes && (
                          <p className="line-clamp-2 flex-1 text-sm text-slate-300">
                            {entry.notes}
                          </p>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
