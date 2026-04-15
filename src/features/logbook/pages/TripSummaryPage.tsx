import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Navigation as NavIcon,
  Clock,
  Gauge,
  Fuel,
  Anchor,
  BookOpen,
  Download,
  Calendar,
} from 'lucide-react';
import { format } from 'date-fns';
import { db } from '../../../db/database';
import type { LogEntry, TripSummary } from '../../../types/logbook';
import type { Trip, Route } from '../../../types/navigation';

function formatLat(lat: number): string {
  const dir = lat >= 0 ? 'N' : 'S';
  return `${Math.abs(lat).toFixed(4)}°${dir}`;
}
function formatLng(lng: number): string {
  const dir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lng).toFixed(4)}°${dir}`;
}

const ENTRY_BADGE_COLORS: Record<LogEntry['entryType'], string> = {
  departure: 'bg-green-500/15 text-green-400',
  arrival: 'bg-blue-500/15 text-blue-400',
  incident: 'bg-red-500/15 text-red-400',
  'weather-change': 'bg-amber-500/15 text-amber-400',
  'position-fix': 'bg-slate-500/15 text-slate-300',
  'watch-change': 'bg-slate-500/15 text-slate-300',
  regular: 'bg-slate-500/15 text-slate-300',
};

function csvEscape(value: unknown): string {
  if (value === undefined || value === null) return '';
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function TripSummaryPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tripId) return;
    (async () => {
      const t = await db.trips.get(tripId);
      if (!t) {
        setLoading(false);
        return;
      }
      setTrip(t);
      const rs = (await db.routes.bulkGet(t.routeIds)).filter(Boolean) as Route[];
      setRoutes(rs);
      const es = await db.logEntries.where('tripId').equals(tripId).toArray();
      es.sort((a, b) => b.timestamp - a.timestamp);
      setEntries(es);
      setLoading(false);
    })();
  }, [tripId]);

  const summary: TripSummary | null = useMemo(() => {
    if (!trip) return null;
    const totalDistanceNM = routes.reduce((s, r) => s + r.totalDistanceNM, 0);
    const sorted = [...entries].sort((a, b) => a.timestamp - b.timestamp);
    const totalTimeHours =
      sorted.length >= 2 ? (sorted[sorted.length - 1].timestamp - sorted[0].timestamp) / 3600000 : 0;
    const totalEngineHours = sorted.reduce((m, e) => Math.max(m, e.engineHours ?? 0), 0);
    const speeds = sorted.map((e) => e.speedOverGround).filter((x): x is number => x !== undefined && x > 0);
    const maxSpeed = speeds.length ? Math.max(...speeds) : 0;
    const averageSpeed = speeds.length ? speeds.reduce((s, x) => s + x, 0) / speeds.length : 0;

    const ports = new Set<string>();
    for (const r of routes) {
      for (const wp of r.waypoints) {
        if (wp.waypointType === 'destination' || wp.waypointType === 'anchorage') {
          ports.add(wp.name);
        }
      }
    }

    return {
      tripId: trip.id,
      totalDistanceNM,
      totalTimeHours,
      totalEngineHours,
      totalFuelUsed: 0,
      maxSpeed,
      averageSpeed,
      portsVisited: Array.from(ports),
      logEntryCount: entries.length,
      startDate: trip.startDate,
      endDate: trip.endDate,
    };
  }, [trip, routes, entries]);

  const handleExport = () => {
    if (!trip) return;
    const header = [
      'timestamp_iso',
      'entry_type',
      'lat',
      'lng',
      'course_deg',
      'speed_kt',
      'engine_hours',
      'wind_speed_kt',
      'sea_state',
      'visibility',
      'notes',
    ];
    const rows = entries.map((e) => [
      new Date(e.timestamp).toISOString(),
      e.entryType,
      e.position?.lat ?? '',
      e.position?.lng ?? '',
      e.courseOverGround ?? '',
      e.speedOverGround ?? '',
      e.engineHours ?? '',
      e.windSpeed ?? '',
      e.seaState ?? '',
      e.visibility ?? '',
      e.notes ?? '',
    ]);
    const csv = [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${trip.name.replace(/\s+/g, '-').toLowerCase()}-logbook.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-sea-400 border-t-transparent" />
      </div>
    );
  }

  if (!trip || !summary) {
    return (
      <div className="p-4">
        <Link to="/planner/logbook" className="inline-flex items-center gap-1 text-sea-400">
          <ArrowLeft className="h-4 w-4" />
          Back to Logbook
        </Link>
        <p className="mt-4 text-slate-400">Trip not found.</p>
      </div>
    );
  }

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
            <h2 className="text-lg font-semibold text-slate-100">Trip Summary</h2>
            <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
              <Calendar className="h-3 w-3" />
              {format(new Date(trip.startDate), 'MMM d')} –{' '}
              {format(new Date(trip.endDate), 'MMM d, yyyy')}
              <span className="ml-2 text-slate-500">· {trip.name}</span>
            </div>
          </div>
          <button
            onClick={handleExport}
            className="flex items-center gap-1 rounded bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-700"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
        </div>
      </div>

      <div className="p-4">
        {/* Stats */}
        <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat
            icon={NavIcon}
            label="Distance"
            value={`${summary.totalDistanceNM.toFixed(1)} NM`}
            tone="text-sea-400"
          />
          <Stat
            icon={Clock}
            label="Elapsed"
            value={`${summary.totalTimeHours.toFixed(1)} hrs`}
            tone="text-slate-100"
          />
          <Stat
            icon={Fuel}
            label="Engine hrs"
            value={summary.totalEngineHours.toFixed(1)}
            tone="text-amber-400"
          />
          <Stat
            icon={Gauge}
            label="Max speed"
            value={`${summary.maxSpeed.toFixed(1)} kt`}
            tone="text-slate-100"
          />
          <Stat
            icon={Gauge}
            label="Avg speed"
            value={`${summary.averageSpeed.toFixed(1)} kt`}
            tone="text-slate-100"
          />
          <Stat
            icon={BookOpen}
            label="Log entries"
            value={String(summary.logEntryCount)}
            tone="text-slate-100"
          />
        </div>

        {/* Ports visited */}
        {summary.portsVisited.length > 0 && (
          <section className="mb-5">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
              Ports Visited
            </h3>
            <div className="flex flex-wrap gap-2">
              {summary.portsVisited.map((p) => (
                <div
                  key={p}
                  className="flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900 px-3 py-1 text-xs text-slate-200"
                >
                  <Anchor className="h-3 w-3 text-sea-400" />
                  {p}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Entries */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Log Entries
            </h3>
            <Link
              to={`/planner/logbook?tripId=${trip.id}`}
              className="text-xs text-sea-400 hover:text-sea-300"
            >
              View all entries →
            </Link>
          </div>
          {entries.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/40 p-6 text-center text-sm text-slate-500">
              No log entries yet for this trip.
            </div>
          ) : (
            <div className="space-y-2">
              {entries.map((e) => (
                <Link
                  key={e.id}
                  to={`/planner/logbook/${e.id}`}
                  className="block rounded-lg border border-slate-800 bg-slate-900 p-3 transition-colors hover:border-slate-700"
                >
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {format(new Date(e.timestamp), 'MMM d · HH:mm')}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${ENTRY_BADGE_COLORS[e.entryType]}`}
                    >
                      {e.entryType.replace('-', ' ')}
                    </span>
                  </div>
                  {e.position && (
                    <div className="mt-1 text-xs text-sea-400">
                      {formatLat(e.position.lat)}, {formatLng(e.position.lng)}
                    </div>
                  )}
                  {e.notes && (
                    <p className="mt-1 line-clamp-2 text-sm text-slate-300">{e.notes}</p>
                  )}
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone = 'text-slate-100',
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
      <div className="flex items-center gap-1 text-xs text-slate-500">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className={`mt-1 text-lg font-semibold ${tone}`}>{value}</div>
    </div>
  );
}
