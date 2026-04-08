import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Anchor, Search, MapPin, Star, Plus } from 'lucide-react';
import { db } from '../../../db/database';
import { useSettingsStore } from '../../../stores/settings-store';
import type { Destination, DestinationType } from '../../../types/destination';
import { distanceNM } from '../../../utils/navigation-math';

const typeLabels: Record<DestinationType, string> = {
  marina: 'Marina',
  anchorage: 'Anchorage',
  mooring: 'Mooring Field',
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

type SortMode = 'distance' | 'name' | 'recent';

export function DestinationListPage() {
  const homePort = useSettingsStore((s) => s.homePort);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<DestinationType | 'all'>('all');
  const [sortMode, setSortMode] = useState<SortMode>('distance');

  useEffect(() => {
    db.destinations.toArray().then(setDestinations);
  }, []);

  const withDistance = destinations.map((d) => ({
    ...d,
    distance: distanceNM({ lat: homePort.lat, lng: homePort.lng }, d.position),
  }));

  const filtered = withDistance.filter((d) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      d.name.toLowerCase().includes(q) ||
      (d.description?.toLowerCase().includes(q) ?? false);
    const matchesType = filterType === 'all' || d.type === filterType;
    return matchesSearch && matchesType;
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (sortMode) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'recent':
        return b.updatedAt - a.updatedAt;
      case 'distance':
      default:
        return a.distance - b.distance;
    }
  });

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Destinations</h2>
        <Link
          to="/destinations/new"
          className="flex items-center gap-1.5 rounded-lg bg-sea-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-sea-700"
        >
          <Plus className="h-4 w-4" />
          Add Place
        </Link>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          placeholder="Search name or description..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg bg-slate-800 py-2 pl-9 pr-3 text-sm text-slate-100 placeholder-slate-500 outline-none focus:ring-1 focus:ring-sea-500"
        />
      </div>

      {/* Type filters */}
      <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
        {(['all', 'marina', 'anchorage', 'mooring', 'yacht-club', 'town-dock'] as const).map((type) => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filterType === type
                ? 'bg-sea-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {type === 'all' ? 'All' : typeLabels[type]}
          </button>
        ))}
      </div>

      {/* Sort */}
      <div className="mb-4 flex items-center gap-2 text-xs">
        <span className="text-slate-500">Sort:</span>
        {(['distance', 'name', 'recent'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setSortMode(mode)}
            className={`rounded px-2 py-0.5 font-medium transition-colors ${
              sortMode === mode ? 'bg-slate-700 text-slate-100' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {mode === 'distance' ? 'Nearest' : mode === 'name' ? 'A–Z' : 'Recent'}
          </button>
        ))}
        <span className="ml-auto text-slate-500">
          {sorted.length} {sorted.length === 1 ? 'place' : 'places'}
        </span>
      </div>

      {/* Results */}
      {sorted.length === 0 ? (
        <div className="mt-12 text-center text-slate-400">
          <Anchor className="mx-auto mb-3 h-12 w-12 opacity-50" />
          {destinations.length === 0 ? (
            <>
              <p className="text-lg">No destinations yet</p>
              <p className="mt-1 text-sm">Tap "Add Place" to get started</p>
            </>
          ) : (
            <>
              <p className="text-lg">No matches</p>
              <p className="mt-1 text-sm">Try a different search or filter</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((d) => (
            <Link
              key={d.id}
              to={`/destinations/${d.id}`}
              className="block rounded-lg border border-slate-800 bg-slate-900 p-3 transition-colors hover:border-slate-700"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-medium text-slate-100">{d.name}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${typeColors[d.type]}`}
                    >
                      {typeLabels[d.type]}
                    </span>
                    {d.reviews.length > 0 && (
                      <span className="flex items-center gap-0.5 text-xs text-amber-400">
                        <Star className="h-3 w-3 fill-current" />
                        {(d.reviews.reduce((s, r) => s + r.rating, 0) / d.reviews.length).toFixed(1)}
                      </span>
                    )}
                    {d.isUserAdded && (
                      <span className="text-xs text-slate-600">Custom</span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1 text-xs text-slate-500">
                  <MapPin className="h-3.5 w-3.5" />
                  {d.distance.toFixed(1)} NM
                </div>
              </div>
              {d.description && (
                <p className="mt-2 line-clamp-2 text-xs text-slate-400">{d.description}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
