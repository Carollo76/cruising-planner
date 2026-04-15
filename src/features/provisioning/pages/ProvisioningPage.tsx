import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShoppingCart,
  Droplets,
  Fuel,
  UtensilsCrossed,
  Calendar,
  Users,
  ChevronRight,
  Ship,
} from 'lucide-react';
import { format } from 'date-fns';
import { db } from '../../../db/database';
import { useSettingsStore } from '../../../stores/settings-store';
import type { Trip } from '../../../types/navigation';
import type { ProvisionPlan } from '../../../types/provisioning';

function computeDays(trip: Trip): number {
  const start = new Date(trip.startDate).getTime();
  const end = new Date(trip.endDate).getTime();
  const ms = end - start;
  return Math.max(1, Math.floor(ms / (1000 * 60 * 60 * 24)) + 1);
}

function computeCrew(trip: Trip): number {
  return trip.crewIds.length > 0 ? trip.crewIds.length : 4;
}

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function ensureProvisionPlan(
  trip: Trip,
  defaults: { waterCapacityGallons: number; fuelCapacityGallons: number; fuelConsumptionGPH: number }
): Promise<ProvisionPlan> {
  const existing = await db.provisionPlans.where('tripId').equals(trip.id).first();
  if (existing) return existing;

  const days = computeDays(trip);
  const crew = computeCrew(trip);
  const now = Date.now();

  const plan: ProvisionPlan = {
    id: makeId(),
    tripId: trip.id,
    numberOfDays: days,
    numberOfCrew: crew,
    meals: [],
    waterPlan: {
      tankCapacityGallons: defaults.waterCapacityGallons,
      consumptionPerPersonPerDay: 1.0,
      numberOfCrew: crew,
      numberOfDays: days,
      totalNeeded: crew * days * 1.0 * 1.2,
      reserve: crew * days * 1.0 * 0.2,
      refillStops: [],
    },
    fuelPlan: {
      tankCapacityGallons: defaults.fuelCapacityGallons,
      consumptionGPH: defaults.fuelConsumptionGPH,
      estimatedMotoringHours: 0,
      estimatedGeneratorHours: 0,
      totalNeeded: 0,
      reserve: 0,
      refillStops: [],
    },
    groceryList: [],
    createdAt: now,
    updatedAt: now,
  };

  await db.provisionPlans.put(plan);
  return plan;
}

export function ProvisioningPage() {
  const { boatConfig } = useSettingsStore();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<string>('');
  const [plan, setPlan] = useState<ProvisionPlan | null>(null);
  const [loading, setLoading] = useState(true);

  // Load all applicable trips
  useEffect(() => {
    (async () => {
      const all = await db.trips.toArray();
      const applicable = all
        .filter((t) => t.status === 'planning' || t.status === 'active')
        .sort((a, b) => b.updatedAt - a.updatedAt);
      setTrips(applicable);
      if (applicable.length > 0 && !selectedTripId) {
        setSelectedTripId(applicable[0].id);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedTrip = useMemo(
    () => trips.find((t) => t.id === selectedTripId) ?? null,
    [trips, selectedTripId]
  );

  // Load or create plan whenever trip changes
  useEffect(() => {
    (async () => {
      if (!selectedTrip) {
        setPlan(null);
        return;
      }
      const p = await ensureProvisionPlan(selectedTrip, {
        waterCapacityGallons: boatConfig.waterCapacityGallons,
        fuelCapacityGallons: boatConfig.fuelCapacityGallons,
        fuelConsumptionGPH: boatConfig.fuelConsumptionGPH,
      });
      setPlan(p);
    })();
  }, [selectedTrip, boatConfig]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-sea-400 border-t-transparent" />
      </div>
    );
  }

  if (trips.length === 0) {
    return (
      <div className="p-4">
        <h2 className="mb-4 text-xl font-semibold">Provisioning</h2>
        <div className="mt-12 text-center text-slate-400">
          <Ship className="mx-auto mb-3 h-12 w-12 opacity-50" />
          <p className="text-lg">No active or planning trips</p>
          <p className="mt-1 text-sm">Create a trip to start provisioning</p>
          <Link
            to="/planner/trips/new"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-sea-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-sea-700"
          >
            Create Trip
          </Link>
        </div>
      </div>
    );
  }

  const days = selectedTrip ? computeDays(selectedTrip) : 0;
  const crew = selectedTrip ? computeCrew(selectedTrip) : 0;

  const mealsNeeded = days * 3; // breakfast/lunch/dinner
  const mealsPlanned = plan?.meals.length ?? 0;

  const waterPct = plan
    ? Math.round((plan.waterPlan.totalNeeded / plan.waterPlan.tankCapacityGallons) * 100)
    : 0;
  const waterBarColor = waterPct < 70 ? 'bg-green-500' : waterPct < 90 ? 'bg-amber-500' : 'bg-red-500';

  const fuelPct = plan && plan.fuelPlan.tankCapacityGallons > 0
    ? Math.round((plan.fuelPlan.totalNeeded / plan.fuelPlan.tankCapacityGallons) * 100)
    : 0;

  const groceryTotal = plan?.groceryList.length ?? 0;
  const groceryChecked = plan?.groceryList.filter((g) => g.isPurchased).length ?? 0;

  const tripQs = selectedTripId ? `?tripId=${selectedTripId}` : '';

  return (
    <div className="p-4">
      <h2 className="mb-4 text-xl font-semibold">Provisioning</h2>

      {/* Trip selector */}
      <div className="mb-4">
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500">
          Trip
        </label>
        <select
          value={selectedTripId}
          onChange={(e) => setSelectedTripId(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-slate-100 focus:border-sea-500 focus:outline-none"
        >
          {trips.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} · {t.status}
            </option>
          ))}
        </select>
      </div>

      {/* Trip summary */}
      {selectedTrip && (
        <div className="mb-4 grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <Calendar className="h-3 w-3" />
              Days
            </div>
            <div className="mt-1 text-lg font-semibold text-slate-100">{days}</div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <Users className="h-3 w-3" />
              Crew
            </div>
            <div className="mt-1 text-lg font-semibold text-slate-100">{crew}</div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
            <div className="text-xs text-slate-500">Dates</div>
            <div className="mt-1 text-xs font-medium text-slate-100">
              {format(new Date(selectedTrip.startDate), 'MMM d')} –{' '}
              {format(new Date(selectedTrip.endDate), 'MMM d')}
            </div>
          </div>
        </div>
      )}

      {/* Sub-feature cards */}
      <div className="grid gap-3">
        <Link
          to={`/planner/provisioning/meals${tripQs}`}
          className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900 p-4 transition-colors hover:border-slate-700"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-green-500/10">
            <UtensilsCrossed className="h-5 w-5 text-green-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-slate-100">Meals</h3>
            <p className="mt-0.5 text-sm text-slate-400">
              {mealsPlanned} meals planned / {mealsNeeded} needed
            </p>
          </div>
          <ChevronRight className="h-5 w-5 text-slate-500" />
        </Link>

        <Link
          to={`/planner/provisioning/water${tripQs}`}
          className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900 p-4 transition-colors hover:border-slate-700"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
            <Droplets className="h-5 w-5 text-blue-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-slate-100">Water</h3>
            <p className="mt-0.5 text-sm text-slate-400">
              {plan?.waterPlan.totalNeeded.toFixed(1) ?? '0'} gal needed ·{' '}
              {plan?.waterPlan.tankCapacityGallons ?? boatConfig.waterCapacityGallons} gal tank ({waterPct}% capacity)
            </p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full ${waterBarColor}`}
                style={{ width: `${Math.min(100, waterPct)}%` }}
              />
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-slate-500" />
        </Link>

        <Link
          to={`/planner/provisioning/fuel${tripQs}`}
          className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900 p-4 transition-colors hover:border-slate-700"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
            <Fuel className="h-5 w-5 text-amber-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-slate-100">Fuel</h3>
            <p className="mt-0.5 text-sm text-slate-400">
              {plan?.fuelPlan.totalNeeded.toFixed(1) ?? '0'} gal needed ·{' '}
              {plan?.fuelPlan.tankCapacityGallons ?? boatConfig.fuelCapacityGallons} gal tank ({fuelPct}% capacity)
            </p>
          </div>
          <ChevronRight className="h-5 w-5 text-slate-500" />
        </Link>

        <Link
          to={`/planner/provisioning/grocery${tripQs}`}
          className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900 p-4 transition-colors hover:border-slate-700"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-purple-500/10">
            <ShoppingCart className="h-5 w-5 text-purple-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-slate-100">Grocery List</h3>
            <p className="mt-0.5 text-sm text-slate-400">
              {groceryTotal} items ({groceryChecked} checked off)
            </p>
          </div>
          <ChevronRight className="h-5 w-5 text-slate-500" />
        </Link>
      </div>
    </div>
  );
}
