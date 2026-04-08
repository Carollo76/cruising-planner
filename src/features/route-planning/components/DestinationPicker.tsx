import { useState, useEffect } from 'react';
import { X, Anchor, MapPin, Search } from 'lucide-react';
import { db } from '../../../db/database';
import type { Destination, DestinationType } from '../../../types/destination';

interface DestinationPickerProps {
  open: boolean;
  onClose: () => void;
  onPick: (destination: Destination) => void;
}

const typeLabels: Record<DestinationType, string> = {
  marina: 'Marina',
  anchorage: 'Anchorage',
  mooring: 'Mooring',
  'yacht-club': 'Yacht Club',
  'town-dock': 'Town Dock',
};

const typeColors: Record<DestinationType, string> = {
  marina: 'bg-blue-500/10 text-blue-400',
  anchorage: 'bg-green-500/10 text-green-400',
  mooring: 'bg-purple-500/10 text-purple-400',
  'yacht-club': 'bg-amber-500/10 text-amber-400',
  'town-dock': 'bg-teal-500/10 text-teal-400',
};

export function DestinationPicker({ open, onClose, onPick }: DestinationPickerProps) {
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (open) {
      db.destinations.toArray().then(setDestinations);
      setSearch('');
    }
  }, [open]);

  if (!open) return null;

  const filtered = destinations.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center">
      <div className="flex h-[80vh] w-full max-w-md flex-col rounded-t-2xl border border-slate-700 bg-slate-900 sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 p-4">
          <div className="flex items-center gap-2">
            <Anchor className="h-5 w-5 text-sea-400" />
            <h3 className="text-lg font-semibold text-slate-100">Pick Destination</h3>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search destinations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg bg-slate-800 py-2 pl-9 pr-3 text-sm text-slate-100 placeholder-slate-500 outline-none focus:ring-1 focus:ring-sea-500"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-3">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">
              {destinations.length === 0 ? 'No destinations yet' : 'No matches'}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((d) => (
                <button
                  key={d.id}
                  onClick={() => {
                    onPick(d);
                    onClose();
                  }}
                  className="flex w-full items-start gap-3 rounded-lg border border-slate-800 bg-slate-900 p-3 text-left transition-colors hover:border-slate-700 hover:bg-slate-800"
                >
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                  <div className="flex-1 min-w-0">
                    <h4 className="truncate font-medium text-slate-100">{d.name}</h4>
                    <div className="mt-1 flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${typeColors[d.type]}`}>
                        {typeLabels[d.type]}
                      </span>
                      <span className="font-mono text-xs text-slate-500">
                        {d.position.lat.toFixed(3)}°, {d.position.lng.toFixed(3)}°
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
