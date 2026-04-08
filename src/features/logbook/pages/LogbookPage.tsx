import { useState, useEffect } from 'react';
import { BookOpen, Plus, MapPin, Clock } from 'lucide-react';
import { db } from '../../../db/database';
import type { LogEntry } from '../../../types/logbook';
import { format } from 'date-fns';

export function LogbookPage() {
  const [entries, setEntries] = useState<LogEntry[]>([]);

  useEffect(() => {
    db.logEntries.orderBy('timestamp').reverse().toArray().then(setEntries);
  }, []);

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Logbook</h2>
        <button className="flex items-center gap-1.5 rounded-lg bg-sea-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-sea-700">
          <Plus className="h-4 w-4" />
          New Entry
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="mt-12 text-center text-slate-400">
          <BookOpen className="mx-auto mb-3 h-12 w-12 opacity-50" />
          <p className="text-lg">No log entries yet</p>
          <p className="mt-1 text-sm">Start recording your voyage</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div key={entry.id} className="rounded-lg border border-slate-800 bg-slate-900 p-3">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {format(new Date(entry.timestamp), 'MMM d, yyyy HH:mm')}
                </span>
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs capitalize">
                  {entry.entryType}
                </span>
              </div>
              {entry.position && (
                <div className="mt-1 flex items-center gap-1 text-xs text-sea-400">
                  <MapPin className="h-3 w-3" />
                  {entry.position.lat.toFixed(4)}°N, {Math.abs(entry.position.lng).toFixed(4)}°W
                </div>
              )}
              <p className="mt-2 text-sm text-slate-300">{entry.notes}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
