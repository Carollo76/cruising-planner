import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck, Plus, Play, Pencil, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { db } from '../../../db/database';
import type { Checklist, ChecklistRun } from '../../../types/safety';

const categoryBadge: Record<Checklist['category'], { label: string; className: string }> = {
  'pre-departure': { label: 'Pre-Departure', className: 'bg-green-500/15 text-green-400' },
  underway: { label: 'Underway', className: 'bg-blue-500/15 text-blue-400' },
  arrival: { label: 'Arrival', className: 'bg-purple-500/15 text-purple-400' },
  'heavy-weather': { label: 'Heavy Weather', className: 'bg-red-500/15 text-red-400' },
  custom: { label: 'Custom', className: 'bg-teal-500/15 text-teal-400' },
};

interface ChecklistWithLastRun extends Checklist {
  lastRun?: ChecklistRun;
}

export function ChecklistListPage() {
  const [checklists, setChecklists] = useState<ChecklistWithLastRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const allChecklists = await db.checklists.toArray();
        const allRuns = await db.checklistRuns.toArray();

        const enriched: ChecklistWithLastRun[] = allChecklists.map((cl) => {
          const runs = allRuns
            .filter((r) => r.checklistId === cl.id)
            .sort((a, b) => b.startedAt - a.startedAt);
          return { ...cl, lastRun: runs[0] };
        });

        // Fixed display order: pre-departure, underway, heavy-weather, arrival, then custom
        const categoryOrder: Record<string, number> = {
          'pre-departure': 1,
          underway: 2,
          'heavy-weather': 3,
          arrival: 4,
          custom: 5,
        };
        enriched.sort((a, b) => {
          const oa = categoryOrder[a.category] ?? 99;
          const ob = categoryOrder[b.category] ?? 99;
          if (oa !== ob) return oa - ob;
          // Within same category, defaults first then alphabetical
          if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

        setChecklists(enriched);
      } catch (err) {
        console.error('Failed to load checklists:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="p-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
            <ClipboardCheck className="h-5 w-5 text-green-400" />
          </div>
          <h2 className="text-xl font-semibold text-slate-100">Checklists</h2>
        </div>
        <Link
          to="/planner/safety/checklists/new"
          className="flex items-center gap-1.5 rounded-lg bg-sea-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-sea-500"
        >
          <Plus className="h-4 w-4" />
          New Checklist
        </Link>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="py-12 text-center text-sm text-slate-400">Loading checklists...</div>
      )}

      {/* Empty state */}
      {!loading && checklists.length === 0 && (
        <div className="rounded-lg border border-slate-800 bg-slate-900 py-12 text-center">
          <ClipboardCheck className="mx-auto mb-3 h-10 w-10 text-slate-600" />
          <p className="text-sm text-slate-400">No checklists yet.</p>
          <Link
            to="/planner/safety/checklists/new"
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-sea-400 hover:text-sea-300"
          >
            <Plus className="h-4 w-4" />
            Create your first checklist
          </Link>
        </div>
      )}

      {/* Checklist cards */}
      <div className="space-y-3">
        {checklists.map((cl) => {
          const badge = categoryBadge[cl.category];
          const itemCount = cl.items.length;
          const completedCount = cl.lastRun ? cl.lastRun.completedItems.length : 0;
          const lastRunDate = cl.lastRun ? cl.lastRun.startedAt : null;

          return (
            <div
              key={cl.id}
              className="rounded-lg border border-slate-800 bg-slate-900 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {/* Name and badge */}
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-medium text-slate-100">{cl.name}</h3>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </div>

                  {/* Meta info */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                    <span>{itemCount} item{itemCount !== 1 ? 's' : ''}</span>
                    {lastRunDate && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Last run {format(new Date(lastRunDate), 'MMM d, yyyy')}
                      </span>
                    )}
                    {cl.lastRun && (
                      <span>
                        {completedCount} of {itemCount} completed
                        {cl.lastRun.completedAt ? ' (finished)' : ' (in progress)'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-2">
                  <Link
                    to={`/planner/safety/checklists/${cl.id}/edit`}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
                    title="Edit checklist"
                  >
                    <Pencil className="h-4 w-4" />
                  </Link>
                  <Link
                    to={`/planner/safety/checklists/${cl.id}/run`}
                    className="flex items-center gap-1.5 rounded-lg bg-sea-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-sea-500"
                  >
                    <Play className="h-3.5 w-3.5" />
                    Start
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
