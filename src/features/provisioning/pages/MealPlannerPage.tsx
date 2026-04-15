import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, X, Zap, Save } from 'lucide-react';
import { db } from '../../../db/database';
import { useSettingsStore } from '../../../stores/settings-store';
import type { Trip } from '../../../types/navigation';
import type { MealPlan, ProvisionPlan } from '../../../types/provisioning';
import { ensureProvisionPlan } from './ProvisioningPage';

const MEAL_TYPES: Array<MealPlan['mealType']> = ['breakfast', 'lunch', 'dinner', 'snack'];

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function MealPlannerPage() {
  const [searchParams] = useSearchParams();
  const tripIdFromUrl = searchParams.get('tripId') ?? '';
  const { boatConfig } = useSettingsStore();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [plan, setPlan] = useState<ProvisionPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState<{ day: number; mealType: MealPlan['mealType'] } | null>(
    null
  );
  const [draft, setDraft] = useState<Partial<MealPlan>>({});
  const [ingredientsText, setIngredientsText] = useState<string>('');

  useEffect(() => {
    (async () => {
      let t: Trip | undefined;
      if (tripIdFromUrl) {
        t = await db.trips.get(tripIdFromUrl);
      }
      if (!t) {
        // Fall back to most recent planning/active trip
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
      setLoading(false);
    })();
  }, [tripIdFromUrl, boatConfig]);

  const dayCount = plan?.numberOfDays ?? 0;
  const days = useMemo(() => Array.from({ length: dayCount }, (_, i) => i + 1), [dayCount]);

  const mealAt = (day: number, mealType: MealPlan['mealType']): MealPlan | undefined => {
    return plan?.meals.find((m) => m.day === day && m.mealType === mealType);
  };

  const openEditor = (day: number, mealType: MealPlan['mealType']) => {
    setEditorOpen({ day, mealType });
    const existing = mealAt(day, mealType);
    if (existing) {
      setDraft(existing);
      setIngredientsText(existing.ingredients.join(', '));
    } else {
      setDraft({
        day,
        mealType,
        name: '',
        description: '',
        ingredients: [],
        isEasyToMake: false,
        notes: '',
      });
      setIngredientsText('');
    }
  };

  const closeEditor = () => {
    setEditorOpen(null);
    setDraft({});
    setIngredientsText('');
  };

  const saveMeal = async () => {
    if (!plan || !editorOpen) return;
    const ingredientsValue: string[] = ingredientsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const existing = plan.meals.find(
      (m) => m.day === editorOpen.day && m.mealType === editorOpen.mealType
    );

    const next: MealPlan = {
      id: existing?.id ?? makeId(),
      day: editorOpen.day,
      mealType: editorOpen.mealType,
      name: (draft.name ?? '').trim(),
      description: draft.description || undefined,
      ingredients: ingredientsValue,
      isEasyToMake: !!draft.isEasyToMake,
      notes: draft.notes || undefined,
    };

    if (!next.name) {
      closeEditor();
      return;
    }

    const newMeals = existing
      ? plan.meals.map((m) => (m.id === existing.id ? next : m))
      : [...plan.meals, next];

    const updated: ProvisionPlan = { ...plan, meals: newMeals, updatedAt: Date.now() };
    await db.provisionPlans.put(updated);
    setPlan(updated);
    closeEditor();
  };

  const deleteMeal = async () => {
    if (!plan || !editorOpen) return;
    const existing = plan.meals.find(
      (m) => m.day === editorOpen.day && m.mealType === editorOpen.mealType
    );
    if (!existing) {
      closeEditor();
      return;
    }
    const updated: ProvisionPlan = {
      ...plan,
      meals: plan.meals.filter((m) => m.id !== existing.id),
      updatedAt: Date.now(),
    };
    await db.provisionPlans.put(updated);
    setPlan(updated);
    closeEditor();
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
      <div className="mb-3 flex items-center gap-2">
        <Link
          to="/planner/provisioning"
          className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h2 className="text-xl font-semibold">Meal Planner</h2>
          <p className="text-xs text-slate-500">
            {trip.name} · {dayCount} days · {plan.numberOfCrew} crew
          </p>
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="sticky left-0 bg-slate-950 px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-500"></th>
              {MEAL_TYPES.map((mt) => (
                <th
                  key={mt}
                  className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-500"
                >
                  {mt}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day}>
                <td className="sticky left-0 bg-slate-950 px-2 py-2 align-middle text-sm font-semibold text-slate-300">
                  Day {day}
                </td>
                {MEAL_TYPES.map((mt) => {
                  const meal = mealAt(day, mt);
                  return (
                    <td key={mt} className="min-w-[160px] align-top">
                      <button
                        onClick={() => openEditor(day, mt)}
                        className={`h-full min-h-[64px] w-full rounded-lg border p-2 text-left transition-colors ${
                          meal
                            ? 'border-slate-700 bg-slate-900 hover:border-sea-500'
                            : 'border-dashed border-slate-700 bg-slate-900/40 hover:border-slate-600'
                        }`}
                      >
                        {meal ? (
                          <>
                            <div className="flex items-start gap-1">
                              <span className="flex-1 text-sm font-medium text-slate-100">
                                {meal.name}
                              </span>
                              {meal.isEasyToMake && (
                                <span className="inline-flex items-center gap-0.5 rounded bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-400">
                                  <Zap className="h-2.5 w-2.5" />
                                  Easy
                                </span>
                              )}
                            </div>
                            {meal.ingredients.length > 0 && (
                              <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                                {meal.ingredients.join(', ')}
                              </p>
                            )}
                          </>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-slate-500">
                            <Plus className="h-3 w-3" />
                            Add
                          </span>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Editor modal */}
      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
          <div className="w-full max-w-md rounded-t-2xl border border-slate-800 bg-slate-900 p-4 sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-100">
                Day {editorOpen.day} ·{' '}
                <span className="capitalize">{editorOpen.mealType}</span>
              </h3>
              <button
                onClick={closeEditor}
                className="rounded p-1.5 text-slate-400 hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Name</label>
                <input
                  type="text"
                  value={draft.name ?? ''}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="e.g. Pasta with marinara"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 focus:border-sea-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Description</label>
                <input
                  type="text"
                  value={draft.description ?? ''}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 focus:border-sea-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Ingredients (comma-separated)
                </label>
                <textarea
                  value={ingredientsText}
                  onChange={(e) => setIngredientsText(e.target.value)}
                  rows={3}
                  placeholder="pasta, marinara sauce, parmesan"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 focus:border-sea-500 focus:outline-none"
                />
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!draft.isEasyToMake}
                  onChange={(e) => setDraft({ ...draft, isEasyToMake: e.target.checked })}
                  className="h-5 w-5 rounded border-slate-700 bg-slate-950 text-sea-500 focus:ring-sea-500"
                />
                <span className="text-sm text-slate-100">Easy to make (underway)</span>
              </label>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Notes</label>
                <textarea
                  value={draft.notes ?? ''}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                  rows={2}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 focus:border-sea-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2">
              {mealAt(editorOpen.day, editorOpen.mealType) && (
                <button
                  onClick={deleteMeal}
                  className="rounded-lg bg-red-500/10 px-3 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/20"
                >
                  Delete
                </button>
              )}
              <div className="flex-1" />
              <button
                onClick={closeEditor}
                className="rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={saveMeal}
                className="flex items-center gap-1.5 rounded-lg bg-sea-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-sea-700"
              >
                <Save className="h-4 w-4" />
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
