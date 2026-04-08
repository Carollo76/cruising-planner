import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Navigation, Clock, Fuel, Trash2 } from 'lucide-react';
import { db } from '../../../db/database';
import type { Route } from '../../../types/navigation';
import { formatDistance, formatDuration } from '../../../utils/navigation-math';

export function RouteListPage() {
  const [routes, setRoutes] = useState<Route[]>([]);

  const loadRoutes = () => {
    db.routes.orderBy('createdAt').reverse().toArray().then(setRoutes);
  };

  useEffect(() => {
    loadRoutes();
  }, []);

  const handleDelete = async (e: React.MouseEvent, id: string, name: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm(`Delete route "${name}"? This cannot be undone.`)) {
      await db.routes.delete(id);
      loadRoutes();
    }
  };

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Routes</h2>
        <Link
          to="/routes/new"
          className="flex items-center gap-1.5 rounded-lg bg-sea-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-sea-700"
        >
          <Plus className="h-4 w-4" />
          New Route
        </Link>
      </div>

      {routes.length === 0 ? (
        <div className="mt-12 text-center text-slate-400">
          <Navigation className="mx-auto mb-3 h-12 w-12 opacity-50" />
          <p className="text-lg">No routes yet</p>
          <p className="mt-1 text-sm">Create your first route to start planning</p>
        </div>
      ) : (
        <div className="space-y-3">
          {routes.map((route) => (
            <Link
              key={route.id}
              to={`/routes/${route.id}`}
              className="group block rounded-lg border border-slate-800 bg-slate-900 p-4 transition-colors hover:border-slate-700"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-medium text-slate-100">{route.name}</h3>
                  {route.description && (
                    <p className="mt-1 truncate text-sm text-slate-400">{route.description}</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Navigation className="h-3.5 w-3.5" />
                      {formatDistance(route.totalDistanceNM)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {formatDuration(route.totalEstimatedTimeHours)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Fuel className="h-3.5 w-3.5" />
                      {route.totalEstimatedFuelGallons.toFixed(1)} gal
                    </span>
                    <span className="text-slate-600">{route.waypoints.length} waypoints</span>
                  </div>
                </div>
                <button
                  onClick={(e) => handleDelete(e, route.id, route.name)}
                  className="shrink-0 rounded p-1.5 text-slate-600 transition-colors hover:bg-red-500/10 hover:text-red-400"
                  aria-label="Delete route"
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
