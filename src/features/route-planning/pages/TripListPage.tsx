import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Calendar, Trash2, Compass } from 'lucide-react';
import { format } from 'date-fns';
import { db } from '../../../db/database';
import type { Trip } from '../../../types/navigation';

const statusColors: Record<Trip['status'], string> = {
  planning: 'bg-amber-500/10 text-amber-400',
  active: 'bg-green-500/10 text-green-400',
  completed: 'bg-slate-500/10 text-slate-400',
};

export function TripListPage() {
  const [trips, setTrips] = useState<Trip[]>([]);

  const load = () => {
    db.trips.orderBy('startDate').reverse().toArray().then(setTrips);
  };

  useEffect(() => {
    load();
  }, []);

  const handleDelete = async (e: React.MouseEvent, id: string, name: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm(`Delete trip "${name}"? Routes will not be deleted.`)) {
      await db.trips.delete(id);
      load();
    }
  };

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Trips</h2>
        <Link
          to="/planner/trips/new"
          className="flex items-center gap-1.5 rounded-lg bg-sea-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-sea-700"
        >
          <Plus className="h-4 w-4" />
          New Trip
        </Link>
      </div>

      {trips.length === 0 ? (
        <div className="mt-12 text-center text-slate-400">
          <Compass className="mx-auto mb-3 h-12 w-12 opacity-50" />
          <p className="text-lg">No trips yet</p>
          <p className="mt-1 text-sm">A trip groups routes, crew, and provisioning for a voyage</p>
        </div>
      ) : (
        <div className="space-y-3">
          {trips.map((trip) => (
            <Link
              key={trip.id}
              to={`/planner/trips/${trip.id}`}
              className="group block rounded-lg border border-slate-800 bg-slate-900 p-4 transition-colors hover:border-slate-700"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-medium text-slate-100">{trip.name}</h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusColors[trip.status]}`}
                    >
                      {trip.status}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {format(new Date(trip.startDate), 'MMM d')} –{' '}
                      {format(new Date(trip.endDate), 'MMM d, yyyy')}
                    </span>
                    <span>{trip.routeIds.length} routes</span>
                    <span>{trip.crewIds.length} crew</span>
                  </div>
                </div>
                <button
                  onClick={(e) => handleDelete(e, trip.id, trip.name)}
                  className="shrink-0 rounded p-1.5 text-slate-600 transition-colors hover:bg-red-500/10 hover:text-red-400"
                  aria-label="Delete trip"
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
