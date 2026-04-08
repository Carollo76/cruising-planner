import { useForm } from 'react-hook-form';
import { useSettingsStore } from '../../../stores/settings-store';
import { Sailboat, Save, RotateCcw } from 'lucide-react';
import { BENETEAU_OCEANIS_37 } from '../../../constants/boat-defaults';
import type { BoatConfig } from '../../../types/boat';
import { HomePortEditor } from '../components/HomePortEditor';
import { ApiKeysEditor } from '../components/ApiKeysEditor';

export function BoatConfigPage() {
  const { boatConfig, setBoatConfig } = useSettingsStore();

  const { register, handleSubmit, reset, formState: { isDirty } } = useForm<BoatConfig>({
    defaultValues: boatConfig,
  });

  const onSubmit = (data: BoatConfig) => {
    setBoatConfig({ ...boatConfig, ...data, id: boatConfig.id });
    reset(data);
  };

  const resetDefaults = () => {
    reset(BENETEAU_OCEANIS_37);
    setBoatConfig(BENETEAU_OCEANIS_37);
  };

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center gap-3">
        <Sailboat className="h-6 w-6 text-sea-400" />
        <h2 className="text-xl font-semibold">Boat Configuration</h2>
      </div>

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
