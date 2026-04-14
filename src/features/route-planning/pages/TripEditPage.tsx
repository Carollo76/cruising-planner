import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { v4 as uuid } from 'uuid';
import { ArrowLeft, Save, Plus, X, Navigation } from 'lucide-react';
import { format } from 'date-fns';
import { db } from '../../../db/database';
import type { Trip, Route } from '../../../types/navigation';
import type { CrewMember } from '../../../types/crew';

export function TripEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';

  const [loading, setLoading] = useState(!isNew);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(
    format(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd')
  );
  const [status, setStatus] = useState<Trip['status']>('planning');
  const [routeIds, setRouteIds] = useState<string[]>([]);
  const [crewIds, setCrewIds] = useState<string[]>([]);
  const [createdAt, setCreatedAt] = useState<number>(Date.now());

  const [availableRoutes, setAvailableRoutes] = useState<Route[]>([]);
  const [availableCrew, setAvailableCrew] = useState<CrewMember[]>([]);

  useEffect(() => {
    db.routes.toArray().then(setAvailableRoutes);
    db.crewMembers.toArray().then(setAvailableCrew);

    if (!isNew && id) {
      db.trips.get(id).then((trip) => {
        if (trip) {
          setName(trip.name);
          setNotes(trip.notes ?? '');
          setStartDate(trip.startDate);
          setEndDate(trip.endDate);
          setStatus(trip.status);
          setRouteIds(trip.routeIds);
          setCrewIds(trip.crewIds);
          setCreatedAt(trip.createdAt);
        }
        setLoading(false);
      });
    }
  }, [id, isNew]);

  const save = async () => {
    const tripId = isNew ? uuid() : id!;
    const now = Date.now();
    const trip: Trip = {
      id: tripId,
      name: name.trim() || 'Untitled Trip',
      startDate,
      endDate,
      routeIds,
      crewIds,
      status,
      notes: notes.trim() || undefined,
      createdAt: isNew ? now : createdAt,
      updatedAt: now,
    };
    await db.trips.put(trip);
    navigate(`/planner/trips/${tripId}`);
  };

  /** Save trip first, then open route planner with trip linkage */
  const saveAndCreateRoute = async () => {
    const tripId = isNew ? uuid() : id!;
    const now = Date.now();
    const trip: Trip = {
      id: tripId,
      name: name.trim() || 'Untitled Trip',
      startDate,
      endDate,
      routeIds,
      crewIds,
      status,
      notes: notes.trim() || undefined,
      createdAt: isNew ? now : createdAt,
      updatedAt: now,
    };
    await db.trips.put(trip);
    navigate(`/planner/routes/new?tripId=${tripId}`);
  };

  const toggleRoute = (rid: string) => {
    setRouteIds((prev) => (prev.includes(rid) ? prev.filter((x) => x !== rid) : [...prev, rid]));
  };

  const toggleCrew = (cid: string) => {
    setCrewIds((prev) => (prev.includes(cid) ? prev.filter((x) => x !== cid) : [...prev, cid]));
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-sea-400 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={() => navigate(isNew ? '/trips' : `/trips/${id}`)}
          className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h2 className="flex-1 text-xl font-semibold">{isNew ? 'New Trip' : 'Edit Trip'}</h2>
        <button
          onClick={save}
          disabled={!name.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-sea-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-sea-700 disabled:opacity-40"
        >
          <Save className="h-4 w-4" />
          Save
        </button>
      </div>

      <div className="space-y-5">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">Trip Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Labor Day Chesapeake Cruise"
            className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">Status</label>
          <div className="flex gap-2">
            {(['planning', 'active', 'completed'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                  status === s ? 'bg-sea-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Trip goals, reservations, notes..."
            className="w-full resize-none rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:ring-1 focus:ring-sea-500"
          />
        </div>

        <div>
          <label className="mb-2 block text-xs font-medium text-slate-400">
            Routes ({routeIds.length} selected)
          </label>
          {availableRoutes.length > 0 && (
            <div className="space-y-1">
              {availableRoutes.map((r) => (
                <button
                  key={r.id}
                  onClick={() => toggleRoute(r.id)}
                  className={`flex w-full items-center justify-between rounded border px-3 py-2 text-left text-sm transition-colors ${
                    routeIds.includes(r.id)
                      ? 'border-sea-600 bg-sea-600/10 text-slate-100'
                      : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div>
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-slate-500">
                      {r.totalDistanceNM.toFixed(1)} NM · {r.waypoints.length} waypoints
                    </div>
                  </div>
                  {routeIds.includes(r.id) ? (
                    <X className="h-4 w-4 text-sea-400" />
                  ) : (
                    <Plus className="h-4 w-4 text-slate-600" />
                  )}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={saveAndCreateRoute}
            disabled={!name.trim()}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-700 bg-slate-900/50 px-3 py-3 text-sm font-medium text-sea-400 transition-colors hover:border-sea-600 hover:bg-sea-600/10 disabled:opacity-40"
          >
            <Navigation className="h-4 w-4" />
            Create New Route for This Trip
          </button>
          {availableRoutes.length === 0 && (
            <p className="mt-1 text-xs text-slate-500">
              Or create routes separately from the Routes tab and select them above
            </p>
          )}
        </div>

        <div>
          <label className="mb-2 block text-xs font-medium text-slate-400">
            Crew ({crewIds.length} selected)
          </label>
          {availableCrew.length === 0 ? (
            <p className="text-sm text-slate-500">No crew yet. Add crew from the More menu.</p>
          ) : (
            <div className="space-y-1">
              {availableCrew.map((c) => (
                <button
                  key={c.id}
                  onClick={() => toggleCrew(c.id)}
                  className={`flex w-full items-center justify-between rounded border px-3 py-2 text-left text-sm transition-colors ${
                    crewIds.includes(c.id)
                      ? 'border-sea-600 bg-sea-600/10 text-slate-100'
                      : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs capitalize text-slate-500">
                      {c.role.replace('-', ' ')}
                    </div>
                  </div>
                  {crewIds.includes(c.id) ? (
                    <X className="h-4 w-4 text-sea-400" />
                  ) : (
                    <Plus className="h-4 w-4 text-slate-600" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
