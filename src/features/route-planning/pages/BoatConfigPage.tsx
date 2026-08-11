import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useSettingsStore } from '../../../stores/settings-store';
import { Sailboat, Save, RotateCcw, Plus, Copy, Trash2, Check } from 'lucide-react';
import { BENETEAU_OCEANIS_37 } from '../../../constants/boat-defaults';
import type { BoatConfig } from '../../../types/boat';
import { HomePortEditor } from '../components/HomePortEditor';
import { ApiKeysEditor } from '../components/ApiKeysEditor';

export function BoatConfigPage() {
  const { boatConfig, setBoatConfig, boats, activeBoatId, addBoat, duplicateBoat, selectBoat, deleteBoat } =
    useSettingsStore();

  const { register, handleSubmit, reset, formState: { isDirty } } = useForm<BoatConfig>({
    defaultValues: boatConfig,
  });

  // Switching boats must repopulate the form; react-hook-form only reads
  // defaultValues once, so reset explicitly whenever the active boat changes.
  useEffect(() => {
    reset(boatConfig);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBoatId]);

  const onSubmit = (data: BoatConfig) => {
    setBoatConfig({ ...boatConfig, ...data, id: boatConfig.id });
    reset(data);
  };

  const resetDefaults = () => {
    // Restore the stock Oceanis 37 specs onto *this* boat, keeping its identity
    // so the reset does not silently replace a different vessel in the fleet.
    const restored = { ...BENETEAU_OCEANIS_37, id: boatConfig.id, name: boatConfig.name };
    reset(restored);
    setBoatConfig(restored);
  };

  const handleAddBoat = () => {
    const name = prompt('Name for the new boat?')?.trim();
    if (name === undefined) return; // cancelled
    addBoat(name || undefined);
  };

  const handleDeleteBoat = () => {
    if (boats.length <= 1) return;
    if (confirm(`Remove "${boatConfig.name}" from your boats? Trips and routes are not affected.`)) {
      deleteBoat(activeBoatId);
    }
  };

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center gap-3">
        <Sailboat className="h-6 w-6 text-sea-400" />
        <h2 className="text-xl font-semibold">Boat Configuration</h2>
      </div>

      {/* ── Fleet picker ── */}
      <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900 p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            Your Boats ({boats.length})
          </h3>
          {isDirty && (
            <span className="text-xs text-amber-400">Unsaved edits — save before switching</span>
          )}
        </div>

        <div className="space-y-1.5">
          {boats.map((b) => {
            const active = b.id === activeBoatId;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => selectBoat(b.id)}
                className={`flex w-full items-center gap-2 rounded border px-3 py-2 text-left text-sm transition-colors ${
                  active
                    ? 'border-sea-600 bg-sea-600/10 text-slate-100'
                    : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                }`}
              >
                {active ? (
                  <Check className="h-4 w-4 shrink-0 text-sea-400" />
                ) : (
                  <Sailboat className="h-4 w-4 shrink-0 text-slate-600" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{b.name || 'Unnamed boat'}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {[b.make, b.model].filter(Boolean).join(' ') || 'No make/model'}
                    {b.loa ? ` · ${b.loa} ft` : ''}
                  </span>
                </span>
                {active && <span className="shrink-0 text-xs text-sea-400">In use</span>}
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleAddBoat}
            className="flex items-center gap-1.5 rounded bg-sea-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sea-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Boat
          </button>
          <button
            type="button"
            onClick={() => duplicateBoat(activeBoatId)}
            className="flex items-center gap-1.5 rounded bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700"
          >
            <Copy className="h-3.5 w-3.5" />
            Duplicate
          </button>
          <button
            type="button"
            onClick={handleDeleteBoat}
            disabled={boats.length <= 1}
            title={boats.length <= 1 ? 'You need at least one boat' : 'Remove this boat'}
            className="flex items-center gap-1.5 rounded bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-red-900/40 hover:text-red-300 disabled:opacity-40 disabled:hover:bg-slate-800 disabled:hover:text-slate-300"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>

        <p className="mt-2 text-xs text-slate-500">
          The boat in use drives route ETAs, fuel and water planning, provisioning, and float plans.
        </p>
      </section>

      <div className="mb-6 space-y-4">
        <HomePortEditor />
        <ApiKeysEditor />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Vessel Info</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Boat Name</label>
              <input {...register('name')} className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Make</label>
              <input {...register('make')} className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Model</label>
              <input {...register('model')} className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Year</label>
              <input type="number" {...register('year', { valueAsNumber: true })} className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500" />
            </div>
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Dimensions</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">LOA (ft)</label>
              <input type="number" step="0.1" {...register('loa', { valueAsNumber: true })} className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Beam (ft)</label>
              <input type="number" step="0.1" {...register('beam', { valueAsNumber: true })} className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Air Draft (ft)
              </label>
              <input
                type="number"
                step="0.1"
                placeholder="masthead above water"
                {...register('airDraftFt', { valueAsNumber: true })}
                className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:ring-1 focus:ring-sea-500"
              />
              <p className="mt-0.5 text-xs text-slate-500">
                Highest point above the waterline. Bridge clearance is not checked without it.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Draft (ft)</label>
              <input type="number" step="0.1" {...register('draft', { valueAsNumber: true })} className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Displacement (lbs)</label>
              <input type="number" {...register('displacement', { valueAsNumber: true })} className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500" />
            </div>
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Engine & Capacity</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Engine (HP)</label>
              <input type="number" {...register('engineHP', { valueAsNumber: true })} className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Fuel Consumption (GPH)</label>
              <input type="number" step="0.1" {...register('fuelConsumptionGPH', { valueAsNumber: true })} className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Fuel Tank (gal)</label>
              <input type="number" {...register('fuelCapacityGallons', { valueAsNumber: true })} className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Water Tank (gal)</label>
              <input type="number" {...register('waterCapacityGallons', { valueAsNumber: true })} className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Holding Tank (gal)</label>
              <input type="number" {...register('holdingTankGallons', { valueAsNumber: true })} className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Cruising Speed (kt)</label>
              <input type="number" step="0.1" {...register('cruisingSpeedKnots', { valueAsNumber: true })} className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Max Speed (kt)</label>
              <input type="number" step="0.1" {...register('maxSpeedKnots', { valueAsNumber: true })} className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Sleeps</label>
              <input type="number" {...register('sleeperCapacity', { valueAsNumber: true })} className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500" />
            </div>
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Registration</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Registration #</label>
              <input {...register('registrationNumber')} className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Hailing Port</label>
              <input {...register('hailingPort')} className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">MMSI</label>
              <input {...register('mmsi')} className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Call Sign</label>
              <input {...register('callSign')} className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Hull Color</label>
              <input {...register('hullColor')} placeholder="White" className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:ring-1 focus:ring-sea-500" />
            </div>
          </div>
        </section>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={!isDirty}
            className="flex items-center gap-1.5 rounded-lg bg-sea-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sea-700 disabled:opacity-40"
          >
            <Save className="h-4 w-4" />
            Save
          </button>
          <button
            type="button"
            onClick={resetDefaults}
            className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700"
          >
            <RotateCcw className="h-4 w-4" />
            Reset to Defaults
          </button>
        </div>
      </form>
    </div>
  );
}
