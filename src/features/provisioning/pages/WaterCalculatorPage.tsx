import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Droplets, AlertTriangle, Save, Check } from 'lucide-react';
import { db } from '../../../db/database';
import { useSettingsStore } from '../../../stores/settings-store';
import type { Trip, Route } from '../../../types/navigation';
import type { Destination } from '../../../types/destination';
import type { ProvisionPlan } from '../../../types/provisioning';
import { ensureProvisionPlan } from './ProvisioningPage';

export function WaterCalculatorPage() {
  const [searchParams] = useSearchParams();
  const tripIdFromUrl = searchParams.get('tripId') ?? '';
  const { boatConfig } = useSettingsStore();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [plan, setPlan] = useState<ProvisionPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  // Form state
  const [tankCapacity, setTankCapacity] = useState<number>(0);
  const [consumption, setConsumption] = useState<number>(1.0);
  const [crew, setCrew] = useState<number>(4);
  const [days, setDays] = useState<number>(1);
  const [refillStops, setRefillStops] = useState<string[]>([]);

  // Destinations available for refill
  const [tripDestinations, setTripDestinations] = useState<Destination[]>([]);

  useEffect(() => {
    (async () => {
      let t: Trip | undefined;
      if (tripIdFromUrl) {
        t = await db.trips.get(tripIdFromUrl);
      }
      if (!t) {
        const all = await db.trips.toArray();
        const applicable = all
          .filter((x) => x.status === 'planning' || x.status === 'active')
          .sort((a, b) => b.updatedAt - a.updatedAt);
        t = applicable[0];
      }
      if (!t) {
        setLoading(false);
        return;
      }
      setTrip(t);
      const p = await ensureProvisionPlan(t, {
        waterCapacityGallons: boatConfig.waterCapacityGallons,
        fuelCapacityGallons: boatConfig.fuelCapacityGallons,
        fuelConsumptionGPH: boatConfig.fuelConsumptionGPH,
      });
      setPlan(p);
      setTankCapacity(p.waterPlan.tankCapacityGallons);
      setConsumption(p.waterPlan.consumptionPerPersonPerDay);
      setCrew(p.waterPlan.numberOfCrew);
      setDays(p.waterPlan.numberOfDays);
      setRefillStops(p.waterPlan.refillStops);

      // Gather destinations from the trip's routes' destination waypoints
      const routes = (await db.routes.bulkGet(t.routeIds)).filter(Boolean) as Route[];
      const allDests = await db.destinations.toArray();
      const destMap = new Map(allDests.map((d) => [d.name.toLowerCase(), d]));

      const used = new Set<string>();
      for (const r of routes) {
        for (const wp of r.waypoints) {
          if (wp.waypointType === 'destination' || wp.waypointType === 'anchorage') {
            const d = destMap.get(wp.name.toLowerCase());
            if (d && d.amenities.water) used.add(d.id);
          }
        }
      }

      // If no route destinations matched, fall back to nearby water-amenity destinations
      let relevant = allDests.filter((d) => used.has(d.id));
      if (relevant.length === 0) {
        relevant = allDests.filter((d) => d.amenities.water).slice(0, 12);
      }
      setTripDestinations(relevant);
      setLoading(false);
    })();
  }, [tripIdFromUrl, boatConfig]);

  // Live computation
  const calc = useMemo(() => {
    const safeCrew = Math.max(0, crew);
    const safeDays = Math.max(0, days);
    const safeCons = Math.max(0, consumption);
    const base = safeCrew * safeDays * safeCons;
    const reserve = base * 0.2;
    const total = base + reserve;
    const pct = tankCapacity > 0 ? Math.round((total / tankCapacity) * 100) : 0;
    return { base, reserve, total, pct };
  }, [crew, days, consumption, tankCapacity]);

  const barColor = calc.pct < 70 ? 'bg-green-500' : calc.pct < 90 ? 'bg-amber-500' : 'bg-red-500';

  const needsRefill = calc.total > tankCapacity;
  const refillWarning = needsRefill && refillStops.length === 0;

  const toggleRefill = (id: string) => {
    setRefillStops((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSave = async () => {
    if (!plan) return;
    const updated: ProvisionPlan = {
      ...plan,
      waterPlan: {
        tankCapacityGallons: tankCapacity,
        consumptionPerPersonPerDay: consumption,
        numberOfCrew: crew,
        numberOfDays: days,
        totalNeeded: calc.total,
        reserve: calc.reserve,
        refillStops,
      },
      updatedAt: Date.now(),
    };
    await db.provisionPlans.put(updated);
    setPlan(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-sea-400 border-t-transparent" />
      </div>
    );
  }

  if (!trip || !plan) {
    return (
      <div className="p-4">
        <Link to="/planner/provisioning" className="inline-flex items-center gap-1 text-sea-400">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
        <p className="mt-4 text-slate-400">No trip selected.</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center gap-2">
        <Link
          to="/planner/provisioning"
          className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Droplets className="h-5 w-5 text-blue-400" />
            Water Calculator
          </h2>
          <p className="text-xs text-slate-500">{trip.name}</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Inputs */}
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
            Inputs
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-slate-400">Tank capacity (gal)</label>
              <input
                type="number"
                min={0}
                value={tankCapacity}
                onChange={(e) => setTankCapacity(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 focus:border-sea-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Gal per person per day</label>
              <input
                type="number"
                min={0}
                step={0.1}
                value={consumption}
                onChange={(e) => setConsumption(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 focus:border-sea-500 focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                0.5 conservation · 1.0 typical · 2.0 comfort
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Number of crew</label>
              <input
                type="number"
                min={0}
                value={crew}
                onChange={(e) => setCrew(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 focus:border-sea-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Number of days</label>
              <input
                type="number"
                min={0}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 focus:border-sea-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
            Calculation
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Base need (crew × days × rate)</span>
              <span className="text-slate-100">{calc.base.toFixed(1)} gal</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Reserve (+20%)</span>
              <span className="text-slate-100">{calc.reserve.toFixed(1)} gal</span>
            </div>
            <div className="flex justify-between border-t border-slate-800 pt-2 text-base font-semibold">
              <span className="text-slate-200">Total needed</span>
              <span className="text-blue-400">{calc.total.toFixed(1)} gal</span>
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs text-slate-400">
              <span>Tank capacity usage</span>
              <span>{calc.pct}%</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full transition-all ${barColor}`}
                style={{ width: `${Math.min(100, calc.pct)}%` }}
              />
            </div>
          </div>

          {refillWarning && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <div className="text-xs text-red-300">
                <strong>Tank capacity insufficient</strong> — you need {calc.total.toFixed(1)} gal but tank
                holds only {tankCapacity} gal. Plan refill stops below.
              </div>
            </div>
          )}
        </div>

        {/* Refill stops */}
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
            Refill stops
          </h3>
          {tripDestinations.length === 0 ? (
            <p className="text-sm text-slate-500">
              No destinations with water amenity available. Add destinations to your route first.
            </p>
          ) : (
            <div className="space-y-1.5">
              {tripDestinations.map((d) => (
                <label
                  key={d.id}
                  className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950 p-3 hover:bg-slate-900"
                >
                  <input
                    type="checkbox"
                    checked={refillStops.includes(d.id)}
                    onChange={() => toggleRefill(d.id)}
                    className="h-5 w-5 rounded border-slate-700 bg-slate-950 text-sea-500 focus:ring-sea-500"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-100">{d.name}</div>
                    <div className="text-xs text-slate-500 capitalize">{d.type.replace('-', ' ')}</div>
                  </div>
                  {d.amenities.water && (
                    <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400">
                      Water
                    </span>
                  )}
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-sea-600 px-4 py-3 text-sm font-semibold text-white hover:bg-sea-700"
        >
          {saved ? (
            <>
              <Check className="h-4 w-4" />
              Saved
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save Water Plan
            </>
          )}
        </button>
      </div>
    </div>
  );
}
