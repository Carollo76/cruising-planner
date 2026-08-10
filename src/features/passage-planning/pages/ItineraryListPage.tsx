import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { v4 as uuid } from 'uuid';
import { Plus, CalendarDays, Trash2, Route as RouteIcon } from 'lucide-react';
import { db } from '../../../db/database';
import { localDateKey } from '../../../utils/time';
import { DEFAULT_HOP_CONSTRAINTS, DEFAULT_HOP_WINDOW, type Itinerary } from '../model/itinerary';
import type { Route } from '../../../types/navigation';

/**
 * The cruises list.
 *
 * A new cruise is built from saved routes, one per day, because a hop without a route
 * cannot be timed — the solver says so rather than guessing, and there is no point
 * creating days that can only report that.
 */
export function ItineraryListPage() {
  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [building, setBuilding] = useState(false);
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<string[]>([]);

  const load = () => {
    db.itineraries.orderBy('updatedAt').reverse().toArray().then(setItineraries);
    db.routes.orderBy('createdAt').reverse().toArray().then(setRoutes);
  };

  useEffect(load, []);

  const create = async () => {
    if (picked.length === 0) return;
    const now = Date.now();
    const chosen = picked
      .map((id) => routes.find((r) => r.id === id))
      .filter((r): r is Route => r !== undefined);

    const itinerary: Itinerary = {
      id: uuid(),
      name: name.trim() || 'New cruise',
      startDate: localDateKey(now),
      createdAt: now,
      updatedAt: now,
      hops: chosen.map((route, index) => {
        const waypoints = [...route.waypoints].sort((a, b) => a.sequenceOrder - b.sequenceOrder);
        const first = waypoints[0];
        const last = waypoints[waypoints.length - 1];
        return {
          id: uuid(),
          routeId: route.id,
          dayOffset: index,
          fromStop: {
            name: first?.name || 'Departure',
            position: first?.position ?? { lat: 0, lng: 0 },
            kind: index === 0 ? ('home' as const) : ('mooring' as const),
          },
          toStop: {
            name: last?.name || route.name,
            position: last?.position ?? { lat: 0, lng: 0 },
            kind: 'mooring' as const,
          },
          window: { ...DEFAULT_HOP_WINDOW },
          constraints: { ...DEFAULT_HOP_CONSTRAINTS },
        };
      }),
    };

    await db.itineraries.put(itinerary);
    setBuilding(false);
    setName('');
    setPicked([]);
    load();
  };

  const remove = async (id: string, itineraryName: string) => {
    if (confirm(`Delete "${itineraryName}"? The routes it uses are not deleted.`)) {
      await db.itineraries.delete(id);
      load();
    }
  };

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Cruises</h2>
        <button
          onClick={() => setBuilding((b) => !b)}
          className="flex items-center gap-1.5 rounded-lg bg-sea-600 px-3 py-2 text-sm font-medium text-white hover:bg-sea-700"
        >
          <Plus className="h-4 w-4" />
          New Cruise
        </button>
      </div>

      {building && (
        <section className="mb-4 rounded-lg border border-slate-700 bg-slate-900 p-3">
          <label className="mb-2 block text-xs font-medium text-slate-300">
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Summer cruise east"
              className="mt-1 w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:ring-1 focus:ring-sea-500"
            />
          </label>

          <p className="mb-1 text-xs font-medium text-slate-300">
            Pick a route for each day, in order ({picked.length} chosen)
          </p>
          {routes.length === 0 ? (
            <p className="text-sm text-slate-500">
              No saved routes yet. Plan the day hops first, then build the cruise from them.
            </p>
          ) : (
            <div className="space-y-1">
              {routes.map((route) => {
                const order = picked.indexOf(route.id);
                return (
                  <button
                    key={route.id}
                    onClick={() =>
                      setPicked((prev) =>
                        prev.includes(route.id)
                          ? prev.filter((r) => r !== route.id)
                          : [...prev, route.id]
                      )
                    }
                    className={`flex w-full items-center gap-2 rounded border px-3 py-2 text-left text-sm ${
                      order >= 0
                        ? 'border-sea-600 bg-sea-600/10 text-slate-100'
                        : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        order >= 0 ? 'bg-sea-600 text-white' : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {order >= 0 ? order + 1 : ''}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{route.name}</span>
                    <span className="shrink-0 text-xs text-slate-500">
                      {route.totalDistanceNM.toFixed(0)} NM
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <button
            onClick={create}
            disabled={picked.length === 0}
            className="mt-3 rounded-lg bg-sea-600 px-4 py-2 text-sm font-medium text-white hover:bg-sea-700 disabled:opacity-40"
          >
            Create cruise
          </button>
        </section>
      )}

      {itineraries.length === 0 ? (
        <div className="mt-12 text-center text-slate-400">
          <CalendarDays className="mx-auto mb-3 h-12 w-12 opacity-50" />
          <p className="text-lg">No cruises yet</p>
          <p className="mt-1 text-sm">
            A cruise chains day hops together and times each one against the tide.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {itineraries.map((itinerary) => (
            <Link
              key={itinerary.id}
              to={`/planner/itineraries/${itinerary.id}`}
              className="block rounded-lg border border-slate-800 bg-slate-900 p-4 transition-colors hover:border-slate-700"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-medium text-slate-100">{itinerary.name}</h3>
                  <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5" />
                      from {itinerary.startDate}
                    </span>
                    <span className="flex items-center gap-1">
                      <RouteIcon className="h-3.5 w-3.5" />
                      {itinerary.hops.length} days
                    </span>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    remove(itinerary.id, itinerary.name);
                  }}
                  className="shrink-0 rounded p-1.5 text-slate-600 hover:bg-red-500/10 hover:text-red-400"
                  aria-label="Delete cruise"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
