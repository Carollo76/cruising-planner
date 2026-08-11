import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Sunrise, TriangleAlert, Waves } from 'lucide-react';
import { db } from '../../../db/database';
import { useSettingsStore } from '../../../stores/settings-store';
import type { Route, Position } from '../../../types/navigation';
import type { Destination } from '../../../types/destination';
import {
  nearestTideStation,
  getTideDay,
  heightAt,
  type TideHeightRecord,
} from '../../../services/noaaTides';
import { formatLocalTime, localDateKey, localDateTimeToUtc } from '../../../utils/time';
import { daylightFor } from '../../../utils/solar';
import { distanceNM } from '../../../utils/navigation-math';
import { isStale } from '../../../types/currents';
import { matchGates, nearbyGates, favourablePhase, type GateTransit } from '../logic/matching';
import { gateBinding } from '../model/gates';
import {
  buildCurrentLookup,
  loadCachedGateCurrents,
  prefetchGateCurrents,
  daysToCover,
  type GateCurrentData,
} from '../logic/current-source';
import { solveDeparture, describeOption, type SolveResult, type DepartureOption } from '../logic/solver';
import type { ConstraintBinding } from '../model/constraints';
import { GateTimeline } from '../components/GateTimeline';
import { PropulsionStrip } from '../components/PropulsionStrip';
import { loadPolarForDraft } from '../logic/polar-source';
import { adviseLeg, summarise, type LegPropulsionAdvice } from '../logic/propulsion';
import { fetchWindForecast, windAt, leadDays, type WindForecast } from '../../../services/openMeteoWind';
import type { Polar } from '../logic/polar';

/**
 * Departure planning for one route.
 *
 * Everything here runs off the Dexie cache, so once a day has been fetched the whole
 * screen works at anchor with no signal. Fetching is an explicit button, not a silent
 * background effect, because on a metered phone at sea that distinction matters.
 */
export function DeparturePlannerPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { boatConfig } = useSettingsStore();

  const [route, setRoute] = useState<Route | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gateData, setGateData] = useState<GateCurrentData[]>([]);
  const [fetchFailures, setFetchFailures] = useState<string[]>([]);
  const [polar, setPolar] = useState<Polar | null>(null);
  const [wind, setWind] = useState<WindForecast | null>(null);
  /** The saved destination the route ends at, if one is close enough to be the same place. */
  const [arrivalPlace, setArrivalPlace] = useState<Destination | null>(null);
  const [arrivalStationId, setArrivalStationId] = useState<string | null>(null);
  const [arrivalTide, setArrivalTide] = useState<TideHeightRecord[]>([]);

  const [dateKey, setDateKey] = useState(searchParams.get('date') ?? localDateKey(Date.now()));
  const [earliestTime, setEarliestTime] = useState('04:00');
  const [latestTime, setLatestTime] = useState('16:00');
  const [allowNightArrival, setAllowNightArrival] = useState(false);
  /** Manual override, in minutes past the window start. Null means follow the solver. */
  const [overrideMinutes, setOverrideMinutes] = useState<number | null>(null);

  const path: Position[] = useMemo(
    () =>
      route
        ? [...route.waypoints].sort((a, b) => a.sequenceOrder - b.sequenceOrder).map((w) => w.position)
        : [],
    [route]
  );

  const transits: GateTransit[] = useMemo(() => (path.length >= 2 ? matchGates(path) : []), [path]);
  const nearMisses: GateTransit[] = useMemo(
    () => (path.length >= 2 ? nearbyGates(path) : []),
    [path]
  );

  const earliest = useMemo(() => localDateTimeToUtc(dateKey, earliestTime), [dateKey, earliestTime]);
  const latest = useMemo(() => localDateTimeToUtc(dateKey, latestTime), [dateKey, latestTime]);

  // The polar is chosen by draft; a mismatched certificate is not a small error, so
  // loadPolarForDraft returns null rather than serving the wrong one.
  useEffect(() => {
    loadPolarForDraft(boatConfig.draft).then(setPolar).catch(() => setPolar(null));
  }, [boatConfig.draft]);

  useEffect(() => {
    if (!id) return;
    db.routes
      .get(id)
      .then((r) => {
        setRoute(r ?? null);
        setLoading(false);
      })
      .catch((err) => {
        setError(`Could not load the route: ${(err as Error).message}`);
        setLoading(false);
      });
  }, [id]);

  // Cached data only — never fetches on its own.
  useEffect(() => {
    if (transits.length === 0) {
      setGateData([]);
      return;
    }
    loadCachedGateCurrents(transits, earliest, latest).then(setGateData).catch(() => setGateData([]));
  }, [transits, earliest, latest]);

  // Match the final waypoint to a saved place, so its charted entrance depth can be
  // checked. Half a mile is tight enough that this cannot pick up a neighbouring harbour.
  useEffect(() => {
    if (path.length < 2) {
      setArrivalPlace(null);
      return;
    }
    const end = path[path.length - 1];
    db.destinations.toArray().then((places) => {
      let best: Destination | null = null;
      let bestDistance = Infinity;
      for (const place of places) {
        const d = distanceNM(end, place.position);
        if (d < bestDistance) {
          bestDistance = d;
          best = place;
        }
      }
      setArrivalPlace(bestDistance <= 0.5 ? best : null);
    });
  }, [path]);

  useEffect(() => {
    if (!arrivalPlace) {
      setArrivalStationId(null);
      return;
    }
    nearestTideStation(arrivalPlace.position)
      .then((found) => setArrivalStationId(found?.station.id ?? null))
      .catch(() => setArrivalStationId(null));
  }, [arrivalPlace]);

  const download = useCallback(async () => {
    if (transits.length === 0) return;
    setFetching(true);
    setError(null);
    try {
      const { data, failures } = await prefetchGateCurrents(transits, earliest, latest);
      setGateData(data);
      setFetchFailures(failures);
      if (arrivalStationId) {
        try {
          const days = daysToCover(earliest, latest, 1);
          setArrivalTide(
            await Promise.all(days.map((day) => getTideDay(arrivalStationId, day)))
          );
        } catch {
          // Depth simply stays unassessed, which the verdict reports.
          setArrivalTide([]);
        }
      }
      if (path.length >= 2) {
        try {
          // Ask for enough days to cover the planning date. Open-Meteo tops out at 16;
          // beyond that there simply is no forecast, which the advice will say plainly.
          const daysNeeded = Math.ceil((latest - Date.now()) / 86_400_000) + 2;
          setWind(
            await fetchWindForecast(
              path[Math.floor(path.length / 2)],
              Math.min(16, Math.max(2, daysNeeded))
            )
          );
        } catch {
          // Wind is optional; its absence is reported by the propulsion advice itself.
          setWind(null);
        }
      }
    } catch (err) {
      setError(`Could not fetch predictions: ${(err as Error).message}`);
    } finally {
      setFetching(false);
    }
  }, [transits, earliest, latest, path, arrivalStationId]);

  const bindings: ConstraintBinding[] = useMemo(() => {
    const gates = transits.map((t) => gateBinding(t.gate));
    if (path.length < 2) return gates;
    return [
      ...gates,
      ...(arrivalPlace
        ? [
            {
              id: 'tide:arrival',
              label: `Water at ${arrivalPlace.name}`,
              constraint: {
                kind: 'tide-height' as const,
                stationId: arrivalStationId ?? '',
                controllingDepthFt: arrivalPlace.entranceControllingDepthFt ?? null,
                safetyMarginFt: 2,
              },
              appliesTo: {
                kind: 'destination' as const,
                destinationId: arrivalPlace.id,
                on: 'arrival' as const,
              },
              source: 'seed' as const,
              sourceNote: arrivalPlace.depthSourceNote,
              enabled: true,
            },
          ]
        : []),
      {
        id: 'daylight:arrival',
        label: 'Arrival in daylight',
        constraint: { kind: 'daylight', allowNightArrival },
        appliesTo: { kind: 'destination', destinationId: 'end', on: 'arrival' },
        source: 'seed',
        enabled: true,
      },
    ];
  }, [transits, path.length, allowNightArrival]);

  const solution: SolveResult | null = useMemo(() => {
    if (path.length < 2) return null;
    const lookup = buildCurrentLookup(gateData);
    const destination = path[path.length - 1];
    return solveDeparture({
      path,
      earliest,
      latest,
      cruiseSpeedKn: boatConfig.cruisingSpeedKnots,
      bindings,
      lookupCurrent: lookup,
      boat: {
        draftFt: boatConfig.draft,
        airDraftFt: boatConfig.airDraftFt ?? null,
        cruiseSpeedKn: boatConfig.cruisingSpeedKnots,
      },
      // Daylight is judged at the destination, wherever along the route the check falls.
      contextAt: (_position, at) => {
        const day = arrivalTide.find((r) => r.dateKey === localDateKey(at));
        const tideHeightFt = day ? (heightAt(day, at) ?? undefined) : undefined;
        return { daylight: daylightFor(destination, at), tideHeightFt };
      },
      stepMinutes: 10,
    });
  }, [path, earliest, latest, boatConfig, bindings, gateData, arrivalTide]);

  /** What the slider is showing: the override if set, otherwise the solver's pick. */
  const shown: DepartureOption | null = useMemo(() => {
    if (!solution) return null;
    if (overrideMinutes === null) return solution.best ?? solution.options[0] ?? null;
    const target = earliest + overrideMinutes * 60_000;
    let best: DepartureOption | null = null;
    for (const option of solution.allOptions) {
      if (!best || Math.abs(option.departAt - target) < Math.abs(best.departAt - target)) {
        best = option;
      }
    }
    return best;
  }, [solution, overrideMinutes, earliest]);

  /** Set when a wind forecast exists but does not reach the day being planned. */
  const windGap = useMemo(() => {
    if (!wind || wind.points.length === 0) return null;
    const horizon = wind.points[wind.points.length - 1].at;
    if (latest <= horizon) return null;
    return (
      `The wind forecast only reaches ${localDateKey(horizon)}, so this date is beyond it. ` +
      `Sail advice will fill in nearer the day.`
    );
  }, [wind, latest]);

  /** The route's own legs, which is how a skipper thinks — not the 2 NM solver steps. */
  const legDistances = useMemo(
    () => path.slice(1).map((p, i) => distanceNM(path[i], p)),
    [path]
  );

  /**
   * Advice per leg for the departure currently on screen.
   *
   * A leg's required speed comes only from a gate still ahead of it: once the boat is
   * past the gate, nothing about that gate constrains how fast it sails.
   */
  const propulsion: LegPropulsionAdvice[] = useMemo(() => {
    if (!shown || path.length < 2) return [];
    const gate = shown.outcomes.find((o) => o.kind === 'current-gate');
    const steps = shown.projection.steps;
    if (steps.length === 0) return [];

    const advice: LegPropulsionAdvice[] = [];
    let travelled = 0;

    for (let i = 0; i < legDistances.length; i++) {
      const legNm = legDistances[i];
      const step = steps.find((s) => s.routeDistanceNm >= travelled) ?? steps[steps.length - 1];
      const at = step.departedAt;
      const sample = wind ? windAt(wind, at) : null;

      const gateAhead = gate && gate.routeDistanceNm > travelled;
      const hoursToGate = gateAhead ? (gate.at - at) / 3_600_000 : 0;

      advice.push(
        adviseLeg({
          legId: `leg-${i}`,
          courseDeg: step.courseDeg,
          distanceNm: legNm,
          at,
          wind: sample
            ? { speedKn: sample.speedKn, directionDeg: sample.directionDeg, gustKn: sample.gustKn }
            : null,
          polar,
          requiredSpeedKn:
            gateAhead && hoursToGate > 0.05
              ? (gate.routeDistanceNm - travelled) / hoursToGate
              : null,
          deadlineLabel: gateAhead ? `${gate.label} at ${formatLocalTime(gate.at)}` : null,
          motoring: {
            cruiseSpeedKn: boatConfig.cruisingSpeedKnots,
            fuelGph: boatConfig.fuelConsumptionGPH,
          },
          forecastLeadDays: wind ? leadDays(wind, at) : 99,
          windGapReason: windGap ?? undefined,
        })
      );

      travelled += legNm;
    }
    return advice;
  }, [shown, path, wind, polar, boatConfig, legDistances, windGap]);

  const propulsionSummary = useMemo(
    () => summarise(propulsion, new Map(propulsion.map((a, i) => [a.legId, legDistances[i] ?? 0]))),
    [propulsion, legDistances]
  );

  const windowMinutes = Math.max(10, Math.round((latest - earliest) / 60_000));
  const oldest = gateData.flatMap((g) => g.records).reduce<number | null>(
    (min, r) => (min === null || r.fetchedAt < min ? r.fetchedAt : min),
    null
  );
  const anyStale = gateData.flatMap((g) => g.records).some((r) => isStale(r));

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-sea-400 border-t-transparent" />
      </div>
    );
  }

  if (!route) {
    return (
      <div className="p-4">
        <p className="text-slate-300">Route not found.</p>
        <button onClick={() => navigate('/planner/routes')} className="mt-3 text-sea-400">
          Back to routes
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 pb-8">
      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={() => navigate(`/planner/routes/${route.id}`)}
          className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <h2 className="text-xl font-semibold text-slate-100">Departure Timing</h2>
          <p className="text-xs text-slate-400">{route.name}</p>
        </div>
      </div>

      {error && (
        <p className="mb-3 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {/* Window controls */}
      <section className="mb-4 rounded-lg border border-slate-700 bg-slate-900 p-3">
        <div className="grid grid-cols-3 gap-2">
          <label className="text-xs font-medium text-slate-300">
            Date
            <input
              type="date"
              value={dateKey}
              onChange={(e) => {
                setDateKey(e.target.value);
                setOverrideMinutes(null);
              }}
              className="mt-1 w-full rounded bg-slate-800 px-2 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500"
            />
          </label>
          <label className="text-xs font-medium text-slate-300">
            Earliest
            <input
              type="time"
              value={earliestTime}
              onChange={(e) => {
                setEarliestTime(e.target.value);
                setOverrideMinutes(null);
              }}
              className="mt-1 w-full rounded bg-slate-800 px-2 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500"
            />
          </label>
          <label className="text-xs font-medium text-slate-300">
            Latest
            <input
              type="time"
              value={latestTime}
              onChange={(e) => {
                setLatestTime(e.target.value);
                setOverrideMinutes(null);
              }}
              className="mt-1 w-full rounded bg-slate-800 px-2 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500"
            />
          </label>
        </div>

        <label className="mt-3 flex items-center gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={allowNightArrival}
            onChange={(e) => setAllowNightArrival(e.target.checked)}
            className="h-4 w-4 rounded border-slate-600 bg-slate-700 text-sea-500 focus:ring-sea-500"
          />
          Accept arriving after dark
        </label>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={download}
            disabled={fetching || transits.length === 0}
            className="flex items-center gap-2 rounded-lg bg-sea-600 px-3 py-2 text-sm font-medium text-white hover:bg-sea-700 disabled:opacity-40"
          >
            <RefreshCw className={`h-4 w-4 ${fetching ? 'animate-spin' : ''}`} />
            {fetching ? 'Fetching…' : 'Download tide data'}
          </button>
          {oldest !== null && (
            <span className={`text-xs ${anyStale ? 'font-semibold text-amber-400' : 'text-slate-400'}`}>
              {anyStale ? 'Stale — ' : ''}predictions fetched {formatLocalTime(oldest)}{' '}
              {localDateKey(oldest)}
            </span>
          )}
        </div>

        {fetchFailures.length > 0 && (
          <p className="mt-2 text-xs text-amber-400">
            Some days could not be fetched: {fetchFailures.slice(0, 3).join('; ')}
          </p>
        )}
      </section>

      {/* Gates on this route */}
      {transits.length === 0 ? (
        <p className="mb-4 rounded border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-slate-300">
          This route does not pass through any of the known tidal gates, so departure timing is
          driven only by daylight and passage length. ETAs on legs away from a gate do not include
          current.
        </p>
      ) : gateData.every((g) => g.records.length === 0) ? (
        <p className="mb-4 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-sm text-amber-200">
          No tide predictions cached for {transits.map((t) => t.gate.name).join(' and ')} on this
          date. Press <strong>Download tide data</strong> while you have signal — after that this
          screen works offline.
        </p>
      ) : null}

      {/* Recommendation */}
      {solution && shown && (
        <section
          className={`mb-4 rounded-lg border p-4 ${
            shown.feasible ? 'border-sea-600/40 bg-sea-600/10' : 'border-red-500/40 bg-red-500/10'
          }`}
        >
          <div className="mb-1 flex items-center gap-2">
            <Waves className="h-5 w-5 text-sea-400" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-sea-300">
              {overrideMinutes === null ? 'Recommended departure' : 'Your chosen departure'}
            </h3>
          </div>
          <p className="text-lg font-semibold text-slate-100">{formatLocalTime(shown.departAt)}</p>
          {!shown.feasible && (
            <p className="mt-1 rounded bg-red-500/20 px-2 py-1 text-sm font-semibold text-red-200">
              This departure does not work —{' '}
              {shown.outcomes.find((o) => o.verdict.status === 'fail')?.verdict.detail}
            </p>
          )}
          <p className="mt-1 text-sm text-slate-200">{describeOption(shown, route.name)}</p>
          <p className="mt-1 text-xs text-slate-400">
            {shown.elapsedHours.toFixed(1)} h passage · {shown.projection.totalDistanceNm.toFixed(1)} NM
            {shown.unknownCount > 0 && ` · ${shown.unknownCount} factor(s) not assessed`}
          </p>
        </section>
      )}

      {solution?.infeasibleReason && (
        <section className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-4">
          <div className="mb-1 flex items-center gap-2">
            <TriangleAlert className="h-5 w-5 text-red-400" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-red-300">
              No workable departure
            </h3>
          </div>
          <p className="text-sm text-red-200">{solution.infeasibleReason}</p>
          {solution.remedies.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-sm text-red-200">
              {solution.remedies.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Manual override */}
      {solution && solution.allOptions.length > 0 && (
        <section className="mb-4 rounded-lg border border-slate-700 bg-slate-900 p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200">Try another departure</h3>
            {overrideMinutes !== null && (
              <button onClick={() => setOverrideMinutes(null)} className="text-xs text-sea-400">
                Back to recommended
              </button>
            )}
          </div>
          <input
            type="range"
            min={0}
            max={windowMinutes}
            step={10}
            value={overrideMinutes ?? Math.round(((shown?.departAt ?? earliest) - earliest) / 60_000)}
            onChange={(e) => setOverrideMinutes(Number(e.target.value))}
            className="w-full accent-sea-500"
          />
          <div className="flex justify-between text-xs font-medium text-slate-400">
            <span>{earliestTime}</span>
            <span>{latestTime}</span>
          </div>
        </section>
      )}

      {/* Timelines */}
      {gateData.map((entry) => {
        const record = entry.records.find((r) => r.dateKey === dateKey);
        if (!record) return null;
        const outcome = shown?.outcomes.find((o) => o.bindingId === `gate:${entry.transit.gate.id}`);
        // Derived from this boat's course through this gate against the station's axis.
        const favourable =
          record.meanFloodDirDeg !== null && record.meanEbbDirDeg !== null
            ? favourablePhase(
                entry.transit.courseDeg,
                record.meanFloodDirDeg,
                record.meanEbbDirDeg
              )
            : 'ebb';
        return (
          <div key={entry.transit.gate.id} className="mb-3">
            <GateTimeline
              label={entry.transit.gate.name}
              record={record}
              outcome={outcome}
              favourable={favourable}
              dayStart={localDateTimeToUtc(dateKey, '00:00')}
            />
            <p className="mt-1 px-1 text-xs text-slate-400">{entry.transit.gate.notes}</p>
          </div>
        );
      })}

      {/* Daylight */}
      {shown && path.length >= 2 && (
        <section className="mb-3 rounded-lg border border-slate-700 bg-slate-900 p-3">
          <div className="mb-1 flex items-center gap-2">
            <Sunrise className="h-4 w-4 text-amber-400" />
            <h4 className="text-sm font-semibold text-slate-200">Daylight at the destination</h4>
          </div>
          {(() => {
            const w = daylightFor(path[path.length - 1], shown.arriveAt);
            return (
              <p className="text-sm text-slate-300">
                Civil dawn {formatLocalTime(w.civilDawn)} · sunrise {formatLocalTime(w.sunrise)} ·
                sunset {formatLocalTime(w.sunset)} · civil dusk {formatLocalTime(w.civilDusk)}
              </p>
            );
          })()}
          <p className="mt-1 text-sm font-medium text-slate-100">
            Projected arrival {formatLocalTime(shown.arriveAt)}
          </p>
        </section>
      )}

      {/* Alternatives */}
      {solution && solution.windows.length > 1 && (
        <section className="mb-3 rounded-lg border border-slate-700 bg-slate-900 p-3">
          <h3 className="mb-2 text-sm font-semibold text-slate-200">Other windows</h3>
          <div className="space-y-1.5">
            {solution.windows.slice(1, 4).map((w) => (
              <button
                key={w.opensAt}
                onClick={() => setOverrideMinutes(Math.round((w.best.departAt - earliest) / 60_000))}
                className="flex w-full items-center justify-between rounded border border-slate-800 bg-slate-950 px-3 py-2 text-left text-sm hover:border-slate-600"
              >
                <span className="font-medium text-slate-100">
                  {formatLocalTime(w.opensAt)}–{formatLocalTime(w.closesAt)}
                </span>
                <span className="text-xs text-slate-400">
                  best {formatLocalTime(w.best.departAt)} · {w.best.elapsedHours.toFixed(1)} h
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Gates near the track but not transited */}
      {nearMisses.length > 0 && (
        <section className="mb-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Near the track, not transited
          </h4>
          {nearMisses.map((t) => (
            <p key={t.gate.id} className="text-xs text-slate-400">
              {t.gate.name} passes {t.offsetNm.toFixed(1)} NM off your route — its current is not
              applied.
            </p>
          ))}
        </section>
      )}

      {propulsion.length > 0 && (
        <div className="mb-3">
          <PropulsionStrip
            advice={propulsion}
            summary={propulsionSummary}
            fuelCapacityGal={boatConfig.fuelCapacityGallons}
          />
        </div>
      )}

      <p className="mt-4 rounded border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs leading-relaxed text-slate-400">
        These are predictions, not observations. Real current varies with wind, runoff and
        barometric pressure. Cross-check against NOAA before departure and treat this as a plan,
        not an instrument.
      </p>
    </div>
  );
}
