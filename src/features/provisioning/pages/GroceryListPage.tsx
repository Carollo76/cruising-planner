import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ShoppingCart,
  Plus,
  Trash2,
  Copy,
  Download,
  Share2,
  Sparkles,
  Check,
} from 'lucide-react';
import { db } from '../../../db/database';
import { useSettingsStore } from '../../../stores/settings-store';
import type { Trip } from '../../../types/navigation';
import type { GroceryItem, ProvisionPlan } from '../../../types/provisioning';
import { ensureProvisionPlan } from './ProvisioningPage';

type Category = GroceryItem['category'];

const CATEGORIES: Category[] = [
  'produce',
  'meat',
  'dairy',
  'dry-goods',
  'canned',
  'beverages',
  'snacks',
  'ice',
  'other',
];

const CATEGORY_LABELS: Record<Category, string> = {
  produce: 'Produce',
  meat: 'Meat & Seafood',
  dairy: 'Dairy',
  'dry-goods': 'Dry Goods',
  canned: 'Canned',
  beverages: 'Beverages',
  snacks: 'Snacks',
  ice: 'Ice',
  other: 'Other',
};

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Heuristic: categorize by ingredient keywords
function guessCategory(name: string): Category {
  const n = name.toLowerCase();
  if (
    /(apple|banana|lettuce|tomato|pepper|onion|garlic|carrot|potato|spinach|kale|cucumber|avocado|lemon|lime|orange|grape|berr|broccoli|cabbage|celery)/.test(
      n
    )
  )
    return 'produce';
  if (/(chicken|beef|pork|sausage|bacon|ham|turkey|lamb|salmon|tuna|fish|shrimp|scallop|crab)/.test(n))
    return 'meat';
  if (/(milk|cheese|butter|cream|yogurt|egg)/.test(n)) return 'dairy';
  if (/(pasta|rice|bread|flour|sugar|oat|cereal|tortilla|quinoa|bean|lentil|oil|vinegar|salt|pepper|spice|herb)/.test(n))
    return 'dry-goods';
  if (/(can|tin|soup|sauce|beans|tomato sauce|tomato paste|tuna)/.test(n)) return 'canned';
  if (/(water|juice|soda|beer|wine|coffee|tea|gatorade)/.test(n)) return 'beverages';
  if (/(chip|cracker|cookie|nut|bar|candy|chocolate|popcorn|pretzel)/.test(n)) return 'snacks';
  if (/(ice|cube)/.test(n)) return 'ice';
  return 'other';
}

export function GroceryListPage() {
  const [searchParams] = useSearchParams();
  const tripIdFromUrl = searchParams.get('tripId') ?? '';
  const { boatConfig } = useSettingsStore();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [plan, setPlan] = useState<ProvisionPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [copyToast, setCopyToast] = useState(false);

  // Add-item form
  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState('1');
  const [newItemUnit, setNewItemUnit] = useState('');
  const [newItemCategory, setNewItemCategory] = useState<Category>('other');

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
      setLoading(false);
    })();
  }, [tripIdFromUrl, boatConfig]);

  const grouped = useMemo(() => {
    const groups: Record<Category, GroceryItem[]> = {
      produce: [],
      meat: [],
      dairy: [],
      'dry-goods': [],
      canned: [],
      beverages: [],
      snacks: [],
      ice: [],
      other: [],
    };
    (plan?.groceryList ?? []).forEach((it) => {
      groups[it.category].push(it);
    });
    return groups;
  }, [plan]);

  const totalCount = plan?.groceryList.length ?? 0;
  const checkedCount = plan?.groceryList.filter((i) => i.isPurchased).length ?? 0;

  const persist = async (items: GroceryItem[]) => {
    if (!plan) return;
    const updated: ProvisionPlan = {
      ...plan,
      groceryList: items,
      updatedAt: Date.now(),
    };
    await db.provisionPlans.put(updated);
    setPlan(updated);
  };

  const generateFromMeals = async () => {
    if (!plan) return;
    // Aggregate by name (case-insensitive)
    const existingByName = new Map<string, GroceryItem>();
    plan.groceryList.forEach((it) => existingByName.set(it.name.toLowerCase(), it));

    const fromMealsCount = new Map<string, { name: string; count: number; mealIds: string[] }>();
    plan.meals.forEach((meal) => {
      meal.ingredients.forEach((ing) => {
        if (!ing) return;
        const key = ing.trim().toLowerCase();
        if (!key) return;
        const entry = fromMealsCount.get(key);
        if (entry) {
          entry.count += 1;
          entry.mealIds.push(meal.id);
        } else {
          fromMealsCount.set(key, { name: ing.trim(), count: 1, mealIds: [meal.id] });
        }
      });
    });

    const merged: GroceryItem[] = [...plan.groceryList];
    for (const [key, info] of fromMealsCount.entries()) {
      const existing = existingByName.get(key);
      if (existing) {
        // keep user's quantity/category, but extend mealIds
        const mergedIds = Array.from(new Set([...(existing.mealIds ?? []), ...info.mealIds]));
        const idx = merged.findIndex((m) => m.id === existing.id);
        if (idx >= 0) {
          merged[idx] = { ...existing, mealIds: mergedIds };
        }
      } else {
        merged.push({
          id: makeId(),
          name: info.name,
          quantity: info.count,
          unit: '',
          category: guessCategory(info.name),
          isPurchased: false,
          mealIds: info.mealIds,
        });
      }
    }

    await persist(merged);
  };

  const addManualItem = async () => {
    if (!plan || !newItemName.trim()) return;
    const item: GroceryItem = {
      id: makeId(),
      name: newItemName.trim(),
      quantity: Number(newItemQty) || 1,
      unit: newItemUnit.trim(),
      category: newItemCategory,
      isPurchased: false,
    };
    await persist([...plan.groceryList, item]);
    setNewItemName('');
    setNewItemQty('1');
    setNewItemUnit('');
    setNewItemCategory('other');
  };

  const toggleItem = async (id: string) => {
    if (!plan) return;
    const updated = plan.groceryList.map((i) =>
      i.id === id ? { ...i, isPurchased: !i.isPurchased } : i
    );
    await persist(updated);
  };

  const deleteItem = async (id: string) => {
    if (!plan) return;
    await persist(plan.groceryList.filter((i) => i.id !== id));
  };

  const toggleCategory = async (category: Category, nextValue: boolean) => {
    if (!plan) return;
    const updated = plan.groceryList.map((i) =>
      i.category === category ? { ...i, isPurchased: nextValue } : i
    );
    await persist(updated);
  };

  const plainText = useMemo(() => {
    if (!plan) return '';
    const lines: string[] = [];
    lines.push(`Grocery List — ${trip?.name ?? 'Trip'}`);
    lines.push('');
    CATEGORIES.forEach((cat) => {
      const items = grouped[cat];
      if (items.length === 0) return;
      lines.push(CATEGORY_LABELS[cat].toUpperCase());
      items.forEach((it) => {
        const qty = it.quantity ? `${it.quantity}${it.unit ? ' ' + it.unit : ''} ` : '';
        const check = it.isPurchased ? '[x]' : '[ ]';
        lines.push(`  ${check} ${qty}${it.name}${it.notes ? ' — ' + it.notes : ''}`);
      });
      lines.push('');
    });
    return lines.join('\n');
  }, [plan, trip, grouped]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(plainText);
      setCopyToast(true);
      setTimeout(() => setCopyToast(false), 1800);
    } catch {
      // ignore
    }
  };

  const handleDownload = () => {
    const blob = new Blob([plainText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `grocery-${(trip?.name ?? 'list').replace(/\s+/g, '-').toLowerCase()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Grocery List — ${trip?.name ?? ''}`,
          text: plainText,
        });
        return;
      } catch {
        // User cancelled or not supported, fall through to copy
      }
    }
    handleCopy();
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
            <ShoppingCart className="h-5 w-5 text-purple-400" />
            Grocery List
          </h2>
          <p className="text-xs text-slate-500">
            {trip.name} · {checkedCount} of {totalCount} items purchased
          </p>
        </div>
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="mb-4 h-2 overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full bg-green-500 transition-all"
            style={{ width: `${Math.round((checkedCount / totalCount) * 100)}%` }}
          />
        </div>
      )}

      {/* Actions */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={generateFromMeals}
          className="flex items-center gap-1.5 rounded-lg bg-sea-600 px-3 py-2 text-sm font-medium text-white hover:bg-sea-700"
        >
          <Sparkles className="h-4 w-4" />
          Generate from Meals
        </button>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-200 hover:border-slate-600"
        >
          {copyToast ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copyToast ? 'Copied' : 'Copy'}
        </button>
        <button
          onClick={handleDownload}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-200 hover:border-slate-600"
        >
          <Download className="h-4 w-4" />
          .txt
        </button>
        <button
          onClick={handleShare}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-200 hover:border-slate-600"
        >
          <Share2 className="h-4 w-4" />
          Share
        </button>
      </div>

      {/* Add item */}
      <div className="mb-4 rounded-lg border border-slate-800 bg-slate-900 p-3">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">Add Item</h3>
        <div className="grid gap-2 sm:grid-cols-[1fr_80px_80px_140px_auto]">
          <input
            type="text"
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            placeholder="Item name"
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 focus:border-sea-500 focus:outline-none"
          />
          <input
            type="number"
            min={0}
            step={0.5}
            value={newItemQty}
            onChange={(e) => setNewItemQty(e.target.value)}
            placeholder="Qty"
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 focus:border-sea-500 focus:outline-none"
          />
          <input
            type="text"
            value={newItemUnit}
            onChange={(e) => setNewItemUnit(e.target.value)}
            placeholder="Unit"
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 focus:border-sea-500 focus:outline-none"
          />
          <select
            value={newItemCategory}
            onChange={(e) => setNewItemCategory(e.target.value as Category)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 focus:border-sea-500 focus:outline-none"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          <button
            onClick={addManualItem}
            disabled={!newItemName.trim()}
            className="flex items-center justify-center gap-1 rounded-lg bg-sea-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-sea-700 disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
      </div>

      {/* List by category */}
      {totalCount === 0 ? (
        <div className="mt-8 text-center text-slate-400">
          <ShoppingCart className="mx-auto mb-3 h-12 w-12 opacity-50" />
          <p className="text-lg">No items yet</p>
          <p className="mt-1 text-sm">
            Tap "Generate from Meals" to auto-populate from your meal plan
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {CATEGORIES.map((cat) => {
            const items = grouped[cat];
            if (items.length === 0) return null;
            const allChecked = items.every((i) => i.isPurchased);
            return (
              <div key={cat} className="rounded-lg border border-slate-800 bg-slate-900">
                <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
                  <h3 className="text-sm font-semibold text-slate-200">
                    {CATEGORY_LABELS[cat]}
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      {items.filter((i) => i.isPurchased).length}/{items.length}
                    </span>
                  </h3>
                  <button
                    onClick={() => toggleCategory(cat, !allChecked)}
                    className="text-xs text-sea-400 hover:text-sea-300"
                  >
                    {allChecked ? 'Uncheck all' : 'Check all'}
                  </button>
                </div>
                <ul className="divide-y divide-slate-800">
                  {items.map((item) => (
                    <li key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={item.isPurchased}
                        onChange={() => toggleItem(item.id)}
                        className="h-5 w-5 rounded border-slate-700 bg-slate-950 text-sea-500 focus:ring-sea-500"
                      />
                      <div className="min-w-0 flex-1">
                        <div
                          className={`text-sm ${
                            item.isPurchased
                              ? 'text-slate-500 line-through'
                              : 'text-slate-100'
                          }`}
                        >
                          {item.quantity > 0 ? `${item.quantity}${item.unit ? ' ' + item.unit : ''} ` : ''}
                          {item.name}
                        </div>
                        {item.notes && (
                          <div className="text-xs text-slate-500">{item.notes}</div>
                        )}
                      </div>
                      <button
                        onClick={() => deleteItem(item.id)}
                        className="rounded p-1.5 text-slate-500 hover:bg-slate-800 hover:text-red-400"
                        aria-label="Delete item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
