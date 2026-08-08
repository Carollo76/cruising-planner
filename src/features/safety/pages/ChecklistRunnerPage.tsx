import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { v4 as uuid } from 'uuid';
import { ArrowLeft, Check, ChevronDown, ChevronRight, MessageSquare, AlertCircle, CheckCircle2 } from 'lucide-react';
import { db } from '../../../db/database';
import type { Checklist, ChecklistRun, ChecklistItem } from '../../../types/safety';
import type { LogEntry } from '../../../types/logbook';
import type { Trip } from '../../../types/navigation';

export function ChecklistRunnerPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [run, setRun] = useState<ChecklistRun | null>(null);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [completedItems, setCompletedItems] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [logged, setLogged] = useState(false);

  // Load checklist and create or resume a run
  useEffect(() => {
    async function load() {
      if (!id) return;
      try {
        const cl = await db.checklists.get(id);
        if (!cl) {
          navigate('/planner/safety/checklists', { replace: true });
          return;
        }
        setChecklist(cl);

        // Detect active trip — either from ?tripId= param or find any trip in 'active' or 'planning' status
        const tripIdParam = searchParams.get('tripId');
        let trip: Trip | undefined;
        if (tripIdParam) {
          trip = await db.trips.get(tripIdParam);
        }
        if (!trip) {
          // Find the most recently updated planning or active trip
          const candidates = await db.trips
            .where('status')
            .anyOf('planning', 'active')
            .toArray();
          trip = candidates.sort((a, b) => b.updatedAt - a.updatedAt)[0];
        }
        if (trip) setActiveTrip(trip);

        // Try to find an incomplete run for this checklist
        const existingRuns = await db.checklistRuns
          .where('checklistId')
          .equals(id)
          .toArray();

        const incompleteRun = existingRuns
          .filter((r) => !r.completedAt)
          .sort((a, b) => b.startedAt - a.startedAt)[0];

        if (incompleteRun) {
          setRun(incompleteRun);
          setCompletedItems(new Set(incompleteRun.completedItems));
          setNotes(incompleteRun.notes || {});
        } else {
          const newRun: ChecklistRun = {
            id: uuid(),
            checklistId: id,
            tripId: trip?.id,
            startedAt: Date.now(),
            completedItems: [],
            notes: {},
          };
          await db.checklistRuns.put(newRun);
          setRun(newRun);
        }
      } catch (err) {
        console.error('Failed to load checklist run:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, navigate, searchParams]);

  // Group items by category
  const groupedItems = useMemo(() => {
    if (!checklist) return [];
    const groups = new Map<string, ChecklistItem[]>();
    const sorted = [...checklist.items].sort((a, b) => a.sortOrder - b.sortOrder);

    for (const item of sorted) {
      const cat = item.category || 'General';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(item);
    }

    return Array.from(groups.entries()).map(([category, items]) => ({ category, items }));
  }, [checklist]);

  // Stats
  const totalItems = checklist?.items.length ?? 0;
  const completedCount = completedItems.size;
  const progressPercent = totalItems > 0 ? Math.round((completedCount / totalItems) * 100) : 0;

  const requiredItems = useMemo(
    () => checklist?.items.filter((i) => i.isRequired) ?? [],
    [checklist],
  );
  const allRequiredDone = useMemo(
    () => requiredItems.every((i) => completedItems.has(i.id)),
    [requiredItems, completedItems],
  );
  const allDone = totalItems > 0 && completedCount === totalItems;

  /** Create a logbook entry documenting checklist completion */
  const createLogEntry = useCallback(
    async (completedArr: string[], notesMap: Record<string, string>) => {
      if (!checklist || logged) return;

      const itemCount = checklist.items.length;
      const doneCount = completedArr.length;
      const skipped = checklist.items
        .filter((i) => !completedArr.includes(i.id))
        .map((i) => i.text);
      const itemNotes = Object.entries(notesMap)
        .filter(([, v]) => v.trim())
        .map(([itemId, text]) => {
          const item = checklist.items.find((i) => i.id === itemId);
          return `  ${item?.text ?? 'Item'}: ${text}`;
        })
        .join('\n');

      let logText = `${checklist.name} checklist completed — ${doneCount} of ${itemCount} items checked.`;
      if (skipped.length > 0) {
        logText += `\nSkipped: ${skipped.join(', ')}`;
      }
      if (itemNotes) {
        logText += `\nNotes:\n${itemNotes}`;
      }

      const logEntry: LogEntry = {
        id: uuid(),
        tripId: activeTrip?.id ?? run?.tripId ?? '',
        timestamp: Date.now(),
        positionSource: 'manual',
        engineRunning: false,
        notes: logText,
        entryType: 'regular',
        createdBy: 'system',
      };

      await db.logEntries.add(logEntry);
      setLogged(true);
    },
    [checklist, activeTrip, run, logged],
  );

  // Persist run changes to Dexie
  const persistRun = useCallback(
    async (newCompleted: Set<string>, newNotes: Record<string, string>, finish?: boolean) => {
      if (!run) return;
      const completedArr = Array.from(newCompleted);
      const isAllDone = checklist ? completedArr.length === checklist.items.length : false;
      const completing = (finish || isAllDone) && !run.completedAt;

      const updated: ChecklistRun = {
        ...run,
        completedItems: completedArr,
        notes: newNotes,
        completedAt: completing ? Date.now() : run.completedAt,
      };
      await db.checklistRuns.put(updated);
      setRun(updated);

      // Auto-log to logbook on completion
      if (completing) {
        await createLogEntry(completedArr, newNotes);
      }
    },
    [run, checklist, createLogEntry],
  );

  // Toggle a checklist item
  const toggleItem = useCallback(
    (itemId: string) => {
      setCompletedItems((prev) => {
        const next = new Set(prev);
        if (next.has(itemId)) {
          next.delete(itemId);
        } else {
          next.add(itemId);
        }
        persistRun(next, notes);
        return next;
      });
    },
    [notes, persistRun],
  );

  // Update a note
  const updateNote = useCallback(
    (itemId: string, text: string) => {
      setNotes((prev) => {
        const next = { ...prev, [itemId]: text };
        if (!text) delete next[itemId];
        persistRun(completedItems, next);
        return next;
      });
    },
    [completedItems, persistRun],
  );

  // Toggle category collapse
  const toggleCategory = useCallback((category: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  // Toggle note expansion
  const toggleNoteExpand = useCallback((itemId: string) => {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }, []);

  // Finish the run
  const handleFinish = useCallback(async () => {
    await persistRun(completedItems, notes, true);
    navigate('/planner/safety/checklists');
  }, [completedItems, notes, persistRun, navigate]);

  if (loading) {
    return (
      <div className="p-4">
        <div className="py-12 text-center text-sm text-slate-400">Loading checklist...</div>
      </div>
    );
  }

  if (!checklist || !run) {
    return (
      <div className="p-4">
        <div className="py-12 text-center text-sm text-slate-400">Checklist not found.</div>
      </div>
    );
  }

  return (
    <div className="p-4">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={() => navigate('/planner/safety/checklists')}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-semibold text-slate-100">{checklist.name}</h2>
        </div>
      </div>

      {/* Trip context */}
      {activeTrip && (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-slate-800/50 px-3 py-2 text-xs text-slate-400">
          <span>Linked to trip:</span>
          <span className="font-medium text-slate-200">{activeTrip.name}</span>
          <span className="text-slate-600">· will auto-log to logbook on completion</span>
        </div>
      )}

      {/* Progress bar */}
      <div className="mb-4 rounded-lg border border-slate-800 bg-slate-900 p-3">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-slate-300">
            {completedCount} of {totalItems} completed
          </span>
          <span className="font-medium text-slate-100">{progressPercent}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-sea-500 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* All required complete banner */}
      {allRequiredDone && requiredItems.length > 0 && !allDone && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/5 p-3">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-green-400" />
          <span className="text-sm font-medium text-green-400">
            All required items complete!
          </span>
        </div>
      )}

      {/* All items complete banner */}
      {allDone && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/5 p-3">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-green-400" />
          <span className="text-sm font-medium text-green-400">
            All items complete! Checklist finished.
          </span>
        </div>
      )}

      {/* Grouped items */}
      <div className="space-y-3">
        {groupedItems.map(({ category, items }) => {
          const isCollapsed = collapsedCategories.has(category);
          const catCompleted = items.filter((i) => completedItems.has(i.id)).length;

          return (
            <div key={category} className="rounded-lg border border-slate-800 bg-slate-900">
              {/* Category header */}
              <button
                onClick={() => toggleCategory(category)}
                className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-slate-800/50"
              >
                <div className="flex items-center gap-2">
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  )}
                  <span className="text-sm font-semibold text-slate-200">{category}</span>
                </div>
                <span className="text-xs text-slate-400">
                  {catCompleted}/{items.length}
                </span>
              </button>

              {/* Items */}
              {!isCollapsed && (
                <div className="border-t border-slate-800">
                  {items.map((item) => {
                    const isChecked = completedItems.has(item.id);
                    const isNoteExpanded = expandedNotes.has(item.id);
                    const hasNote = !!notes[item.id];
                    const isUncheckedRequired = item.isRequired && !isChecked;

                    return (
                      <div
                        key={item.id}
                        className={`border-b border-slate-800/50 last:border-b-0 ${
                          isUncheckedRequired ? 'bg-red-500/5' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3 px-4 py-3">
                          {/* Large tappable checkbox */}
                          <button
                            onClick={() => toggleItem(item.id)}
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                              isChecked
                                ? 'border-sea-500 bg-sea-500 text-white'
                                : isUncheckedRequired
                                  ? 'border-red-500/50 bg-slate-800'
                                  : 'border-slate-600 bg-slate-800'
                            }`}
                            aria-label={`Toggle ${item.text}`}
                          >
                            {isChecked && <Check className="h-4 w-4" />}
                          </button>

                          {/* Item text */}
                          <span
                            className={`flex-1 text-sm ${
                              isChecked
                                ? 'text-slate-500 line-through'
                                : 'text-slate-200'
                            }`}
                          >
                            {item.text}
                            {item.isRequired && (
                              <span className="ml-1 text-red-400">*</span>
                            )}
                          </span>

                          {/* Note toggle */}
                          <button
                            onClick={() => toggleNoteExpand(item.id)}
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
                              hasNote
                                ? 'text-sea-400 hover:bg-slate-800'
                                : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
                            }`}
                            aria-label="Toggle note"
                          >
                            <MessageSquare className="h-4 w-4" />
                          </button>
                        </div>

                        {/* Note textarea */}
                        {isNoteExpanded && (
                          <div className="px-4 pb-3 pl-14">
                            <textarea
                              value={notes[item.id] || ''}
                              onChange={(e) => updateNote(item.id, e.target.value)}
                              placeholder="Add a note..."
                              rows={2}
                              className="w-full resize-none rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-sea-500 focus:outline-none focus:ring-1 focus:ring-sea-500"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Unchecked required warning */}
      {!allRequiredDone && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-400" />
          <span className="text-xs text-amber-300">
            {requiredItems.filter((i) => !completedItems.has(i.id)).length} required item
            {requiredItems.filter((i) => !completedItems.has(i.id)).length !== 1 ? 's' : ''}{' '}
            remaining
          </span>
        </div>
      )}

      {/* Finish button */}
      {!run.completedAt && (
        <div className="mt-6">
          <button
            onClick={handleFinish}
            className="w-full rounded-lg bg-sea-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-sea-500"
          >
            {allRequiredDone ? 'Finish Checklist' : 'Finish (required items incomplete)'}
          </button>
        </div>
      )}
    </div>
  );
}
