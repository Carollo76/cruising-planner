import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Fuel, AlertTriangle, Save, Check } from 'lucide-react';
import { db } from '../../../db/database';
import { useSettingsStore } from '../../../stores/settings-store';
import type { Trip, Route } from '../../../types/navigation';
import type { Destination } from '../../../types/destination';
import type { ProvisionPlan } from '../../../types/provisioning';
import { ensureProvisionPlan } from './ProvisioningPage';

const GENERATOR_GPH = 0.5;

export function FuelCalculatorPage() {
  const [searchParams] = useSearchParams();
  const tripIdFromUrl = searchParams.get('tripId') ?? '';
  const { boatConfig } = useSettingsStore();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [plan, setPlan] = useState<ProvisionPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  const [tankCapacity, setTankCapacity] = useState<number>(0);
  const [gph, setGph] = useState<number>(1.5);
  const [motoringHours, setMotoringHours] = useState<number>(0);
  const [generatorHours, setGeneratorHours] = useState<number>(0);
  const [reservePct, setReservePct] = useState<number>(20);
  const [refillStops, setRefillStops] = useState<string[]>([]);

  const [tripDestinations, setTripDestinations] = useState<Destination[]>([]);
  const [suggestedHours, setSuggestedHours] = useState<number>(0);

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
      setTankCapacity(p.fuelPlan.tankCapacityGallons || boatConfig.fuelCapacityGallons);
      setGph(p.fuelPlan.consumptionGPH || boatConfig.fuelConsumptionGPH);
      setMotoringHours(p.fuelPlan.estimatedMotoringHours);
      setGeneratorHours(p.fuelPlan.estimatedGeneratorHours);
      setRefillStops(p.fuelPlan.refillStops);

      // Compute suggested motoring hours from trip's routes
      const routes = (await db.routes.bulkGet(t.routeIds)).filter(Boolean) as Route[];
      const totalRouteHours = routes.reduce((s, r) => s + (r.totalEstimatedTimeHours ?? 0), 0);
      setSuggestedHours(totalRouteHours);
      if (p.fuelPlan.estimatedMotoringHours === 0 && totalRouteHours > 0) {
        setMotoringHours(totalRouteHours);
      }

      // Destinations with fuel amenity
      const allDests = await db.destinations.toArray();
      const destMap = new Map(allDests.map((d) => [d.name.toLowerCase(), d]));
      const used = new Set<string>();
      for (const r of routes) {
        for (const wp of r.waypoints) {
          const d = destMap.get(wp.name.toLowerCase());
          if (d && d.amenities.fuel) used.add(d.id);
        }
      }
      let relevant = allDests.filter((d) => used.has(d.id));
      if (relevant.length === 0) {
        relevant = allDests.filter((d) => d.amenities.fuel).slice(0, 12);
      }
      setTripDestinations(relevant);
      setLoading(false);
    })();
  }, [tripIdFromUrl, boatConfig]);

  const calc = useMemo(() => {
    const motoringFuel = Math.max(0, motoringHours) * Math.max(0, gph);
    const generatorFuel = Math.max(0, generatorHours) * GENERATOR_GPH;
    const base = motoringFuel + generatorFuel;
    const reserve = base * (reservePct / 100);
    const total = base + reserve;
    const pct = tankCapacity > 0 ? Math.round((total / tankCapacity) * 100) : 0;
    return { motoringFuel, generatorFuel, base, reserve, total, pct };
  }, [motoringHours, gph, generatorHours, reservePct, tankCapacity]);

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
      fuelPlan: {
        tankCapacityGallons: tankCapacity,
        consumptionGPH: gph,
        estimatedMotoringHours: motoringHours,
        estimatedGeneratorHours: generatorHours,
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
            <Fuel className="h-5 w-5 text-amber-400" />
            Fuel Calculator
          </h2>
          <p className="text-xs text-slate-500">{trip.name}</p>
        </div>
      </div>

      <div className="space-y-4">
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
              <label className="mb-1 block text-xs text-slate-400">Fuel consumption (GPH)</label>
              <input
                type="number"
                min={0}
                step={0.1}
                value={gph}
                onChange={(e) => setGph(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 focus:border-sea-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Estimated motoring hours</label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={motoringHours}
                onChange={(e) => setMotoringHours(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 focus:border-sea-500 focus:outline-none"
              />
              {suggestedHours > 0 && (
                <p className="mt-1 text-[11px] text-slate-500">
                  Route estimate: {suggestedHours.toFixed(1)} hrs
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Generator hours</label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={generatorHours}
                onChange={(e) => setGeneratorHours(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 focus:border-sea-500 focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Estimated at {GENERATOR_GPH} GPH
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Reserve %</label>
              <input
                type="number"
                min={0}
                max={100}
                value={reservePct}
                onChange={(e) => setReservePct(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 focus:border-sea-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
            Calculation
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Motoring fuel</span>
              <span className="text-slate-100">{calc.motoringFuel.toFixed(1)} gal</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Generator fuel</span>
              <span className="text-slate-100">{calc.generatorFuel.toFixed(1)} gal</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Reserve (+{reservePct}%)</span>
              <span className="text-slate-100">{calc.reserve.toFixed(1)} gal</span>
            </div>
            <div className="flex justify-between border-t border-slate-800 pt-2 text-base font-semibold">
              <span className="text-slate-200">Total needed</span>
              <span className="text-amber-400">{calc.total.toFixed(1)} gal</span>
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

        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
            Refill stops
          </h3>
          {tripDestinations.length === 0 ? (
            <p className="text-sm text-slate-500">
              No destinations with fuel amenity available. Add fuel stops to your route.
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
                  {d.amenities.fuel && (
                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                      Fuel
                    </span>
                  )}
                </label>
              ))}
            </div>
          )}
        </div>

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
              Save Fuel Plan
            </>
          )}
        </button>
      </div>
    </div>
  );
}
