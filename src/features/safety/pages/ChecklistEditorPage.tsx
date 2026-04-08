import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { v4 as uuid } from 'uuid';
import { ArrowLeft, Save, Trash2, Plus, GripVertical, ArrowUp, ArrowDown } from 'lucide-react';
import { db } from '../../../db/database';
import type { Checklist, ChecklistItem } from '../../../types/safety';

const categoryOptions: { value: Checklist['category']; label: string }[] = [
  { value: 'pre-departure', label: 'Pre-Departure' },
  { value: 'underway', label: 'Underway' },
  { value: 'arrival', label: 'Arrival' },
  { value: 'heavy-weather', label: 'Heavy Weather' },
  { value: 'custom', label: 'Custom' },
];

function createEmptyItem(sortOrder: number): ChecklistItem {
  return {
    id: uuid(),
    text: '',
    category: '',
    isRequired: false,
    sortOrder,
  };
}

export function ChecklistEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id;

  const [name, setName] = useState('');
  const [category, setCategory] = useState<Checklist['category']>('custom');
  const [items, setItems] = useState<ChecklistItem[]>([createEmptyItem(0)]);
  const [isDefault, setIsDefault] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Load existing checklist
  useEffect(() => {
    if (isNew) return;
    async function load() {
      try {
        const cl = await db.checklists.get(id!);
        if (!cl) {
          navigate('/safety/checklists', { replace: true });
          return;
        }
        setName(cl.name);
        setCategory(cl.category);
        setIsDefault(cl.isDefault);
        setItems(
          cl.items.length > 0
            ? [...cl.items].sort((a, b) => a.sortOrder - b.sortOrder)
            : [createEmptyItem(0)],
        );
      } catch (err) {
        console.error('Failed to load checklist:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, isNew, navigate]);

  // Update an item field
  const updateItem = (itemId: string, updates: Partial<ChecklistItem>) => {
    setItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, ...updates } : item)),
    );
  };

  // Add a new item
  const addItem = () => {
    setItems((prev) => [...prev, createEmptyItem(prev.length)]);
  };

  // Remove an item
  const removeItem = (itemId: string) => {
    setItems((prev) => {
      const filtered = prev.filter((i) => i.id !== itemId);
      // Reindex sort orders
      return filtered.map((item, idx) => ({ ...item, sortOrder: idx }));
    });
  };

  // Move an item up
  const moveUp = (index: number) => {
    if (index === 0) return;
    setItems((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next.map((item, idx) => ({ ...item, sortOrder: idx }));
    });
  };

  // Move an item down
  const moveDown = (index: number) => {
    setItems((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next.map((item, idx) => ({ ...item, sortOrder: idx }));
    });
  };

  // Save
  const handleSave = async () => {
    if (!name.trim()) return;
    // Filter out empty items
    const validItems = items.filter((i) => i.text.trim());
    if (validItems.length === 0) return;

    setSaving(true);
    try {
      const now = Date.now();
      const checklist: Checklist = {
        id: isNew ? uuid() : id!,
        name: name.trim(),
        category,
        items: validItems.map((item, idx) => ({
          ...item,
          text: item.text.trim(),
          category: item.category?.trim() || undefined,
          sortOrder: idx,
        })),
        isDefault,
        createdAt: isNew ? now : now, // will be overwritten below for edits
        updatedAt: now,
      };

      if (!isNew) {
        // Preserve original createdAt
        const existing = await db.checklists.get(id!);
        if (existing) {
          checklist.createdAt = existing.createdAt;
        }
      }

      await db.checklists.put(checklist);
      navigate('/safety/checklists');
    } catch (err) {
      console.error('Failed to save checklist:', err);
    } finally {
      setSaving(false);
    }
  };

  // Delete
  const handleDelete = async () => {
    if (!id) return;
    try {
      await db.checklists.delete(id);
      // Also delete associated runs
      const runs = await db.checklistRuns.where('checklistId').equals(id).toArray();
      await db.checklistRuns.bulkDelete(runs.map((r) => r.id));
      navigate('/safety/checklists');
    } catch (err) {
      console.error('Failed to delete checklist:', err);
    }
  };

  if (loading) {
    return (
      <div className="p-4">
        <div className="py-12 text-center text-sm text-slate-400">Loading checklist...</div>
      </div>
    );
  }

  const canSave = name.trim() && items.some((i) => i.text.trim());

  return (
    <div className="p-4">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={() => navigate('/safety/checklists')}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="text-xl font-semibold text-slate-100">
          {isNew ? 'New Checklist' : 'Edit Checklist'}
        </h2>
      </div>

      {/* Name */}
      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium text-slate-300">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Pre-Departure Checklist"
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-sea-500 focus:outline-none focus:ring-1 focus:ring-sea-500"
        />
      </div>

      {/* Category */}
      <div className="mb-6">
        <label className="mb-1 block text-sm font-medium text-slate-300">Category</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as Checklist['category'])}
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-sea-500 focus:outline-none focus:ring-1 focus:ring-sea-500"
        >
          {categoryOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Items */}
      <div className="mb-4">
        <h3 className="mb-2 text-sm font-semibold text-slate-200">Items</h3>
        <div className="space-y-2">
          {items.map((item, index) => (
            <div
              key={item.id}
              className="rounded-lg border border-slate-800 bg-slate-900 p-3"
            >
              <div className="flex items-start gap-2">
                {/* Grip icon (visual indicator for ordering) */}
                <div className="mt-2 flex shrink-0 flex-col items-center text-slate-600">
                  <GripVertical className="h-4 w-4" />
                </div>

                {/* Fields */}
                <div className="min-w-0 flex-1 space-y-2">
                  {/* Item text */}
                  <input
                    type="text"
                    value={item.text}
                    onChange={(e) => updateItem(item.id, { text: e.target.value })}
                    placeholder="Checklist item text"
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-sea-500 focus:outline-none focus:ring-1 focus:ring-sea-500"
                  />

                  <div className="flex items-center gap-2">
                    {/* Sub-group category */}
                    <input
                      type="text"
                      value={item.category || ''}
                      onChange={(e) => updateItem(item.id, { category: e.target.value })}
                      placeholder="Group (e.g., Engine)"
                      className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:border-sea-500 focus:outline-none focus:ring-1 focus:ring-sea-500"
                    />

                    {/* Required toggle */}
                    <button
                      onClick={() => updateItem(item.id, { isRequired: !item.isRequired })}
                      className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        item.isRequired
                          ? 'bg-red-500/15 text-red-400'
                          : 'bg-slate-800 text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {item.isRequired ? 'Required' : 'Optional'}
                    </button>
                  </div>
                </div>

                {/* Reorder & delete controls */}
                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    onClick={() => moveUp(index)}
                    disabled={index === 0}
                    className="flex h-6 w-6 items-center justify-center rounded text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300 disabled:opacity-30"
                    title="Move up"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => moveDown(index)}
                    disabled={index === items.length - 1}
                    className="flex h-6 w-6 items-center justify-center rounded text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300 disabled:opacity-30"
                    title="Move down"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="flex h-6 w-6 items-center justify-center rounded text-slate-500 transition-colors hover:bg-red-500/20 hover:text-red-400"
                    title="Delete item"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Add item button */}
        <button
          onClick={addItem}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-700 py-2.5 text-sm text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-200"
        >
          <Plus className="h-4 w-4" />
          Add Item
        </button>
      </div>

      {/* Action buttons */}
      <div className="mt-6 space-y-3">
        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-sea-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-sea-500 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : 'Save Checklist'}
        </button>

        {/* Delete button (non-default only) */}
        {!isNew && !isDefault && (
          <>
            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/30 py-3 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10"
              >
                <Trash2 className="h-4 w-4" />
                Delete Checklist
              </button>
            ) : (
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
                <p className="mb-3 text-sm text-red-300">
                  Delete this checklist and all its run history? This cannot be undone.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleDelete}
                    className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500"
                  >
                    Confirm Delete
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 rounded-lg border border-slate-700 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
