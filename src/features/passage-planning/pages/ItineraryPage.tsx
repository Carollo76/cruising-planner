import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, RefreshCw, TriangleAlert, Anchor, Waves } from 'lucide-react';
import { db } from '../../../db/database';
import { useSettingsStore } from '../../../stores/settings-store';
import type { Position } from '../../../types/navigation';
import { formatLocalTime } from '../../../utils/time';
import { matchGates } from '../logic/matching';
import {
  buildCurrentLookup,
  loadCachedGateCurrents,
  prefetchGateCurrents,
  type GateCurrentData,
} from '../logic/current-source';
import { solveItinerary, hopDateKey } from '../logic/itinerary-solver';
import type { Itinerary, SolvedItinerary, SolvedHop } from '../model/itinerary';

/**
 * A cruise, one row per day.
 *
 * The itinerary-level view exists so a broken day is visible without opening it — the
 * spec is explicit that an infeasible hop must be flagged here, in red, rather than
 * discovered by drilling in.
 */
export function ItineraryPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { boatConfig } = useSettingsStore();

  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [paths, setPaths] = useState<Map<string, Position[]>>(new Map());
  const [gateData, setGateData] = useState<GateCurrentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [startDate, setStartDate] = useState<string>('');

  useEffect(() => {
    if (!id) return;
    (async () => {
      const found = await db.itineraries.get(id);
      if (!found) {
        setLoading(false);
        return;
      }
      setItinerary(found);
      setStartDate(found.startDate);

      const routes = await db.routes.bulkGet(found.hops.map((h) => h.routeId));
      const map = new Map<string, Position[]>();
      for (const route of routes) {
        if (!route) continue;
        map.set(
          route.id,
          [...route.waypoints].sort((a, b) => a.sequenceOrder - b.sequenceOrder).map((w) => w.position)
        );
      }
      setPaths(map);
      setLoading(false);
    })();
  }, [id]);

  const effective: Itinerary | null = useMemo(
    () => (itinerary ? { ...itinerary, startDate: startDate || itinerary.startDate } : null),
    [itinerary, startDate]
  );

  /** Every gate any hop of this cruise transits. */
  const allTransits = useMemo(() => {
    if (!effective) return [];
    const seen = new Set<string>();
    return effective.hops.flatMap((hop) => {
      const path = paths.get(hop.routeId);
      if (!path || path.length < 2) return [];
      return matchGates(path).filter((t) => {
        if (seen.has(t.gate.id)) return false;
        seen.add(t.gate.id);
        return true;
      });
    });
  }, [effective, paths]);

  const span = useMemo(() => {
    if (!effective || effective.hops.length === 0) return null;
    const days = effective.hops.map((h) => h.dayOffset);
    const first = hopDateKey(effective, effective.hops[0]);
    return {
      from: new Date(`${first}T12:00:00Z`).getTime(),
      to: new Date(`${first}T12:00:00Z`).getTime() + Math.max(...days) * 86_400_000,
    };
  }, [effective]);

  useEffect(() => {
    if (allTransits.length === 0 || !span) return;
    loadCachedGateCurrents(allTransits, span.from, span.to).then(setGateData).catch(() => undefined);
  }, [allTransits, span]);

  const download = useCallback(async () => {
    if (allTransits.length === 0 || !span) return;
    setFetching(true);
    try {
      const { data } = await prefetchGateCurrents(allTransits, span.from, span.to);
      setGateData(data);
    } finally {
      setFetching(false);
    }
  }, [allTransits, span]);

  const solved: SolvedItinerary | null = useMemo(() => {
    if (!effective) return null;
    return solveItinerary({
      itinerary: effective,
      paths,
      cruiseSpeedKn: boatConfig.cruisingSpeedKnots,
      boat: {
        draftFt: boatConfig.draft,
        airDraftFt: null,
        cruiseSpeedKn: boatConfig.cruisingSpeedKnots,
      },
      lookupCurrent: buildCurrentLookup(gateData),
    });
  }, [effective, paths, boatConfig, gateData]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-sea-400 border-t-transparent" />
      </div>
    );
  }

  if (!itinerary || !solved || !effective) {
    return (
      <div className="p-4">
        <p className="text-slate-300">Itinerary not found.</p>
        <button onClick={() => navigate('/planner/itineraries')} className="mt-3 text-sea-400">
          Back to cruises
        </button>
      </div>
    );
  }

  const broken = solved.infeasibleHopIndexes.length;

  return (
    <div className="p-4 pb-8">
      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={() => navigate('/planner/itineraries')}
          className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <h2 className="text-xl font-semibold text-slate-100">{itinerary.name}</h2>
          <p className="text-xs text-slate-400">
            {solved.hops.length} days · {solved.totalDistanceNm.toFixed(0)} NM ·{' '}
            {solved.totalHours.toFixed(1)} h under way
          </p>
        </div>
      </div>

      {broken > 0 && (
        <div className="mb-4 flex gap-3 rounded-lg border border-red-500/50 bg-red-500/10 p-3">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
          <p className="text-sm font-medium text-red-200">
            {broken} of {solved.hops.length} days cannot be sailed as planned. They are marked below.
          </p>
        </div>
      )}

      <section className="mb-4 rounded-lg border border-slate-700 bg-slate-900 p-3">
        <label className="block text-xs font-medium text-slate-300">
          Start date — changing it re-solves the whole cruise
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1 w-full rounded bg-slate-800 px-2 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500"
          />
        </label>
        {startDate !== itinerary.startDate && (
          <button
            onClick={async () => {
              const updated = { ...itinerary, startDate, updatedAt: Date.now() };
              await db.itineraries.put(updated);
              setItinerary(updated);
            }}
            className="mt-2 rounded bg-sea-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sea-700"
          >
            Save new start date
          </button>
        )}

        {allTransits.length > 0 && (
          <button
            onClick={download}
            disabled={fetching}
            className="mt-2 flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-40"
          >
            <RefreshCw className={`h-4 w-4 ${fetching ? 'animate-spin' : ''}`} />
            {fetching ? 'Fetching…' : 'Download tide data for all gates'}
          </button>
        )}
      </section>

      <div className="space-y-3">
        {solved.hops.map((solvedHop, index) => (
          <DayRow key={solvedHop.hop.id} index={index} solved={solvedHop} dateKey={hopDateKey(effective, solvedHop.hop)} />
        ))}
      </div>

      <p className="mt-4 rounded border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs leading-relaxed text-slate-400">
        These are predictions, not observations. Real current varies with wind, runoff and
        barometric pressure. Cross-check against NOAA before departure and treat this as a plan,
        not an instrument.
      </p>
    </div>
  );
}

function DayRow({
  index,
  solved,
  dateKey,
}: {
  index: number;
  solved: SolvedHop;
  dateKey: string;
}) {
  const broken = solved.infeasible !== null;

  return (
    <section
      className={`rounded-lg border p-3 ${
        broken ? 'border-red-500/50 bg-red-500/10' : 'border-slate-700 bg-slate-900'
      }`}
    >
      <div className="mb-2 flex items-start gap-2">
        <CalendarDays className={`mt-0.5 h-4 w-4 shrink-0 ${broken ? 'text-red-400' : 'text-sea-400'}`} />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-slate-100">
            Day {index + 1} · {dateKey}
          </h3>
          <p className="text-xs text-slate-400">
            {solved.hop.fromStop.name} → {solved.hop.toStop.name} ·{' '}
            {solved.distanceNm.toFixed(0)} NM
          </p>
        </div>
        {broken ? (
          <span className="rounded bg-red-500 px-2 py-0.5 text-xs font-bold text-white">NO GO</span>
        ) : (
          <span className="text-right text-sm font-semibold text-slate-100">
            {formatLocalTime(solved.departAt!)} → {formatLocalTime(solved.arriveAt!)}
          </span>
        )}
      </div>

      {broken ? (
        <div className="text-sm text-red-200">
          <p className="font-medium">{solved.infeasible!.constraint}</p>
          <p className="mt-0.5">{solved.infeasible!.detail}</p>
          <ul className="mt-1 list-inside list-disc text-xs">
            {solved.infeasible!.remedies.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          {solved.constrainedByPreviousHop && (
            <p className="mb-1 flex items-center gap-1.5 text-xs text-amber-400">
              <Anchor className="h-3 w-3" />
              Departure set by rest after the previous day, not by your window.
            </p>
          )}
          {solved.gates.length === 0 ? (
            <p className="text-xs text-slate-500">No tidal gates on this hop.</p>
          ) : (
            <div className="space-y-1">
              {solved.gates.map((gate) => (
                <div key={gate.name} className="flex items-start gap-2 text-xs">
                  <Waves
                    className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                      gate.status === 'ok'
                        ? 'text-green-400'
                        : gate.status === 'caution'
                          ? 'text-amber-400'
                          : gate.status === 'fail'
                            ? 'text-red-400'
                            : 'text-slate-500'
                    }`}
                  />
                  <span className="text-slate-300">
                    <strong className="text-slate-100">{gate.name}</strong> {formatLocalTime(gate.at)} —{' '}
                    {gate.detail}
                  </span>
                </div>
              ))}
            </div>
          )}
          {solved.unknownCount > 0 && (
            <p className="mt-1 text-xs text-slate-500">
              {solved.unknownCount} factor(s) could not be assessed for this day.
            </p>
          )}
        </>
      )}
    </section>
  );
}
