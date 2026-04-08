import { Clock } from 'lucide-react';

export function WatchSchedulePage() {
  return (
    <div className="p-4">
      <h2 className="mb-4 text-xl font-semibold">Watch Schedule</h2>
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-6 text-center">
        <Clock className="mx-auto mb-3 h-12 w-12 text-slate-500 opacity-50" />
        <p className="text-slate-400">Create a route and add crew to generate watch schedules</p>
        <p className="mt-2 text-sm text-slate-500">
          Supports 3-hour and 4-hour watch rotations for overnight passages
        </p>
      </div>
    </div>
  );
}
