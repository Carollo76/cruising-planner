import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  Pencil,
  Navigation,
  Users,
  Clock,
  Fuel,
  ClipboardCheck,
  FileText,
  ShoppingCart,
  CloudSun,
  CheckCircle2,
  Plus,
} from 'lucide-react';
import { format } from 'date-fns';
import { db } from '../../../db/database';
import type { Trip, Route } from '../../../types/navigation';
import type { CrewMember } from '../../../types/crew';
import type { ChecklistRun } from '../../../types/safety';
import { formatDistance, formatDuration } from '../../../utils/navigation-math';

const statusColors: Record<Trip['status'], string> = {
  planning: 'bg-amber-500/10 text-amber-400',
  active: 'bg-green-500/10 text-green-400',
  completed: 'bg-slate-500/10 text-slate-400',
};

export function TripDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [checklistRuns, setChecklistRuns] = useState<Array<ChecklistRun & { checklistName: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    async function load() {
      const t = await db.trips.get(id!);
      if (!t) {
        setLoading(false);
        return;
      }
      setTrip(t);
      const rs = await db.routes.bulkGet(t.routeIds);
      setRoutes(rs.filter(Boolean) as Route[]);
      const cs = await db.crewMembers.bulkGet(t.crewIds);
      setCrew(cs.filter(Boolean) as CrewMember[]);

      // Load checklist runs tied to this trip
      const allRuns = await db.checklistRuns.where('tripId').equals(id!).toArray();
      const allChecklists = await db.checklists.toArray();
      const clMap = new Map(allChecklists.map((c) => [c.id, c.name]));
      const enrichedRuns = allRuns
        .map((r) => ({ ...r, checklistName: clMap.get(r.checklistId) ?? 'Unknown' }))
        .sort((a, b) => b.startedAt - a.startedAt);
      setChecklistRuns(enrichedRuns);

      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-sea-400 border-t-transparent" />
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="p-4">
        <p className="text-slate-400">Trip not found</p>
        <Link to="/planner/trips" className="mt-4 inline-block text-sea-400">
          Back to trips
        </Link>
      </div>
    );
  }

  const totalDist = routes.reduce((s, r) => s + r.totalDistanceNM, 0);
  const totalTime = routes.reduce((s, r) => s + r.totalEstimatedTimeHours, 0);
  const totalFuel = routes.reduce((s, r) => s + r.totalEstimatedFuelGallons, 0);
  const days =
    Math.floor(
      (new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime()) /
        (1000 * 60 * 60 * 24)
    ) + 1;

  return (
    <div>
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900 p-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/planner/trips')}
            className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-100">{trip.name}</h2>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusColors[trip.status]}`}
              >
                {trip.status}
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
              <Calendar className="h-3 w-3" />
              {format(new Date(trip.startDate), 'MMM d')} –{' '}
              {format(new Date(trip.endDate), 'MMM d, yyyy')}
              <span className="text-slate-600">· {days} days</span>
            </div>
          </div>
          <Link
            to={`/planner/trips/${trip.id}/edit`}
            className="flex items-center gap-1 rounded bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-700"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Link>
        </div>

        {/* Summary stats */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded bg-slate-800 p-2">
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <Navigation className="h-3 w-3" /> Distance
            </div>
            <div className="mt-0.5 text-sm font-semibold text-slate-100">
              {formatDistance(totalDist)}
            </div>
          </div>
          <div className="rounded bg-slate-800 p-2">
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <Clock className="h-3 w-3" /> Time
            </div>
            <div className="mt-0.5 text-sm font-semibold text-slate-100">
              {formatDuration(totalTime)}
            </div>
          </div>
          <div className="rounded bg-slate-800 p-2">
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <Fuel className="h-3 w-3" /> Fuel
            </div>
            <div className="mt-0.5 text-sm font-semibold text-amber-400">
              {totalFuel.toFixed(1)}g
            </div>
          </div>
          <div className="rounded bg-slate-800 p-2">
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <Users className="h-3 w-3" /> Crew
            </div>
            <div className="mt-0.5 text-sm font-semibold text-slate-100">{crew.length}</div>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-5">
        {trip.notes && (
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
            <p className="text-sm text-slate-300 whitespace-pre-wrap">{trip.notes}</p>
          </div>
        )}

        {/* Routes */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Routes
            </h3>
            <Link
              to={`/planner/routes/new?tripId=${trip.id}`}
              className="flex items-center gap-1 rounded bg-sea-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-sea-700"
            >
              <Plus className="h-3 w-3" />
              Create Route
            </Link>
          </div>
          {routes.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/50 p-6 text-center">
              <Navigation className="mx-auto mb-2 h-8 w-8 text-slate-600" />
              <p className="text-sm text-slate-400">No routes yet</p>
              <Link
                to={`/planner/routes/new?tripId=${trip.id}`}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-sea-600 px-4 py-2 text-sm font-medium text-white hover:bg-sea-700"
              >
                <Plus className="h-4 w-4" />
                Plan a Route
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {routes.map((r) => (
                <Link
                  key={r.id}
                  to={`/planner/routes/${r.id}`}
                  className="block rounded-lg border border-slate-800 bg-slate-900 p-3 transition-colors hover:border-slate-700"
                >
                  <div className="font-medium text-slate-100">{r.name}</div>
                  <div className="mt-1 flex items-center gap-4 text-xs text-slate-500">
                    <span>{formatDistance(r.totalDistanceNM)}</span>
                    <span>{formatDuration(r.totalEstimatedTimeHours)}</span>
                    <span>{r.totalEstimatedFuelGallons.toFixed(1)} gal fuel</span>
                    <span>{r.waypoints.length} waypoints</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Crew */}
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
            Crew
          </h3>
          {crew.length === 0 ? (
            <p className="text-sm text-slate-500">No crew assigned.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {crew.map((c) => (
                <div
                  key={c.id}
                  className="rounded-full border border-slate-800 bg-slate-900 px-3 py-1 text-xs"
                >
                  <span className="font-medium text-slate-100">{c.name}</span>
                  <span className="ml-1 capitalize text-slate-500">
                    {c.role.replace('-', ' ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Checklist completion log */}
        {checklistRuns.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
              Completed Checklists
            </h3>
            <div className="space-y-1.5">
              {checklistRuns.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900 p-3"
                >
                  <CheckCircle2
                    className={`h-4 w-4 shrink-0 ${
                      r.completedAt ? 'text-green-400' : 'text-amber-400'
                    }`}
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-100">{r.checklistName}</div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {r.completedAt
                        ? `Completed ${format(new Date(r.completedAt), 'MMM d, h:mm a')}`
                        : `Started ${format(new Date(r.startedAt), 'MMM d, h:mm a')} — in progress`}
                      {' · '}
                      {r.completedItems.length} items checked
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Weather Assessment — the headline action */}
        {routes.length > 0 && (
          <Link
            to={`/planner/trips/${trip.id}/assess`}
            className="flex items-center gap-3 rounded-lg border border-sea-600/30 bg-sea-600/10 p-4 transition-colors hover:border-sea-500 hover:bg-sea-600/20"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-sea-600/20">
              <CloudSun className="h-6 w-6 text-sea-400" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-slate-100">Go / No-Go Assessment</div>
              <div className="mt-0.5 text-xs text-slate-400">
                Weather, tides, bailout options for your planned departure
              </div>
            </div>
            <div className="text-sea-400">→</div>
          </Link>
        )}

        {/* Quick actions */}
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
            Trip Prep
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Link
              to="/planner/safety"
              className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm hover:border-slate-700"
            >
              <ClipboardCheck className="h-4 w-4 text-green-400" />
              Checklists
            </Link>
            <Link
              to="/planner/safety"
              className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm hover:border-slate-700"
            >
              <FileText className="h-4 w-4 text-blue-400" />
              Float Plan
            </Link>
            <Link
              to="/planner/provisioning"
              className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm hover:border-slate-700"
            >
              <ShoppingCart className="h-4 w-4 text-purple-400" />
              Provisioning
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
