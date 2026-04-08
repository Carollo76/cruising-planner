import { useState, useEffect } from 'react';
import { Crosshair, Layers, Eye, EyeOff } from 'lucide-react';
import { NauticalMap } from '../../../components/map/NauticalMap';
import {
  DestinationMarkers,
  DESTINATION_TYPE_STYLES,
} from '../../../components/map/DestinationMarkers';
import { db } from '../../../db/database';
import type { Destination, DestinationType } from '../../../types/destination';

const ALL_TYPES: DestinationType[] = ['marina', 'anchorage', 'mooring', 'yacht-club', 'town-dock'];

export function ChartPage() {
  const [lastClick, setLastClick] = useState<{ lat: number; lng: number } | null>(null);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [visibleTypes, setVisibleTypes] = useState<Set<DestinationType>>(new Set(ALL_TYPES));
  const [legendOpen, setLegendOpen] = useState(false);
  const [showAll, setShowAll] = useState(true);

  useEffect(() => {
    db.destinations.toArray().then(setDestinations);
  }, []);

  const toggleType = (type: DestinationType) => {
    setVisibleTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (showAll) {
      setVisibleTypes(new Set());
      setShowAll(false);
    } else {
      setVisibleTypes(new Set(ALL_TYPES));
      setShowAll(true);
    }
  };

  const counts = ALL_TYPES.reduce<Record<DestinationType, number>>(
    (acc, t) => {
      acc[t] = destinations.filter((d) => d.type === t).length;
      return acc;
    },
    { marina: 0, anchorage: 0, mooring: 0, 'yacht-club': 0, 'town-dock': 0 }
  );

  return (
    <div className="relative h-[calc(100dvh-4rem)]">
      <NauticalMap onClick={(lat, lng) => setLastClick({ lat, lng })}>
        <DestinationMarkers destinations={destinations} visibleTypes={visibleTypes} />
      </NauticalMap>

      {/* Layer toggle */}
      <div className="absolute right-3 top-3 z-[1000]">
        <button
          onClick={() => setLegendOpen(!legendOpen)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/90 px-3 py-2 text-xs font-medium text-slate-200 shadow-lg backdrop-blur-sm hover:bg-slate-800"
        >
          <Layers className="h-4 w-4" />
          <span>Layers</span>
          <span className="ml-1 rounded-full bg-slate-800 px-1.5 py-0.5 text-xs">
            {visibleTypes.size}
          </span>
        </button>

        {legendOpen && (
          <div className="mt-2 w-60 rounded-lg border border-slate-700 bg-slate-900/95 p-3 shadow-xl backdrop-blur-sm">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Destinations
              </h3>
              <button
                onClick={toggleAll}
                className="flex items-center gap-1 text-xs text-sea-400 hover:text-sea-300"
              >
                {showAll ? (
                  <>
                    <EyeOff className="h-3 w-3" /> Hide All
                  </>
                ) : (
                  <>
                    <Eye className="h-3 w-3" /> Show All
                  </>
                )}
              </button>
            </div>
            <div className="space-y-1">
              {ALL_TYPES.map((type) => {
                const style = DESTINATION_TYPE_STYLES[type];
                const isVisible = visibleTypes.has(type);
                return (
                  <button
                    key={type}
                    onClick={() => toggleType(type)}
                    className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs transition-colors ${
                      isVisible ? 'bg-slate-800 text-slate-100' : 'text-slate-500 hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="flex h-4 w-4 items-center justify-center rounded-full border text-[9px] font-bold leading-none"
                        style={{
                          borderColor: style.color,
                          backgroundColor: isVisible ? style.bg : 'transparent',
                          color: style.color,
                        }}
                      >
                        {style.glyph}
                      </span>
                      <span>{style.label}</span>
                    </div>
                    <span className="text-slate-500">{counts[type]}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 border-t border-slate-800 pt-2 text-[10px] text-slate-500">
              Tap markers for details · {destinations.length} places total
            </div>
          </div>
        )}
      </div>

      {/* Click coordinates overlay */}
      {lastClick && (
        <div className="absolute bottom-4 left-4 z-[1000] flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/90 px-3 py-2 text-sm backdrop-blur-sm">
          <Crosshair className="h-4 w-4 text-sea-400" />
          <span className="font-mono text-sea-400">
            {lastClick.lat.toFixed(4)}°N, {Math.abs(lastClick.lng).toFixed(4)}°W
          </span>
          <button
            onClick={() => setLastClick(null)}
            className="ml-1 text-slate-500 hover:text-slate-300"
            aria-label="Clear"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
