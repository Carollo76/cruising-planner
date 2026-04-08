import { ShoppingCart, Droplets, Fuel, UtensilsCrossed } from 'lucide-react';
import { useSettingsStore } from '../../../stores/settings-store';

export function ProvisioningPage() {
  const { boatConfig } = useSettingsStore();

  return (
    <div className="p-4">
      <h2 className="mb-4 text-xl font-semibold">Provisioning</h2>

      <div className="grid gap-3">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
              <Droplets className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h3 className="font-medium text-slate-100">Water</h3>
              <p className="text-sm text-slate-400">
                Tank: {boatConfig.waterCapacityGallons} gal | ~1 gal/person/day
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
              <Fuel className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h3 className="font-medium text-slate-100">Fuel</h3>
              <p className="text-sm text-slate-400">
                Tank: {boatConfig.fuelCapacityGallons} gal | {boatConfig.fuelConsumptionGPH} GPH
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
              <UtensilsCrossed className="h-5 w-5 text-green-400" />
            </div>
            <div>
              <h3 className="font-medium text-slate-100">Meal Planning</h3>
              <p className="text-sm text-slate-400">Plan meals and generate grocery lists</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
              <ShoppingCart className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <h3 className="font-medium text-slate-100">Grocery List</h3>
              <p className="text-sm text-slate-400">Auto-generated shopping list from meal plan</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
