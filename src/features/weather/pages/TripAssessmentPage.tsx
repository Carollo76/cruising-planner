import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Wind,
  Waves,
  Navigation as NavIcon,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Anchor,
  RefreshCw,
  Calendar,
  TrendingUp,
  Activity,
} from 'lucide-react';
import { format } from 'date-fns';
import { db } from '../../../db/database';
import { useSettingsStore } from '../../../stores/settings-store';
import type { Trip, Route } from '../../../types/navigation';
import type { Destination } from '../../../types/destination';
import {
  assessRoute,
  findBestWeatherWindow,
  type RouteAssessment,
  type SafetyRating,
  type WeatherWindow,
} from '../utils/assessment-engine';
import { clearWindyCache } from '../../../services/windy-weather';

const RATING_COLORS: Record<SafetyRating, { text: string; bg: string; border: string; label: string; icon: any }> = {
  go: { text: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/30', label: 'GO', icon: CheckCircle2 },
  caution: { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', label: 'CAUTION', icon: AlertTriangle },
  'no-go': { text: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', label: 'NO-GO', icon: XCircle },
};

export function TripAssessmentPage() {
  const { id: tripId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { weatherThresholds, apiKeys } = useSettingsStore();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [assessment, setAssessment] = useState<RouteAssessment | null>(null);
  const [windows, setWindows] = useState<WeatherWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [assessing, setAssessing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [departureTime, setDepartureTime] = useState(() => {
    const d = new Date();
    d.setHours(8, 0, 0, 0);
    d.setDate(d.getDate() + 1);
    return d;
  });

  useEffect(() => {
    if (!tripId) return;
    async function load() {
      const t = await db.trips.get(tripId!);
      if (!t) {
        setLoading(false);
        return;
      }
      setTrip(t);
      if (t.routeIds.length > 0) {
        const r = await db.routes.get(t.routeIds[0]);
        setRoute(r ?? null);
        if (r) {
          setDepartureTime(new Date(t.startDate + 'T08:00:00'));
        }
      }
      const ds = await db.destinations.toArray();
      setDestinations(ds);
      setLoading(false);
    }
    load();
  }, [tripId]);

  // Forecast confidence based on how far out the departure is
  const hoursUntilDeparture = (departureTime.getTime() - Date.now()) / (1000 * 60 * 60);
  const daysUntilDeparture = hoursUntilDeparture / 24;

  type Confidence = 'high' | 'moderate' | 'low' | 'unavailable';
  const confidence: Confidence =
    daysUntilDeparture <= 3
      ? 'high'
      : daysUntilDeparture <= 7
      ? 'moderate'
      : daysUntilDeparture <= 10
      ? 'low'
      : 'unavailable';

  const confidenceInfo: Record<Confidence, { label: string; color: string; description: string }> = {
    high: {
      label: 'High Confidence',
      color: 'text-green-400 bg-green-500/10 border-green-500/30',
      description: 'Within 3 days — forecast data is reliable for go/no-go decisions.',
    },
    moderate: {
      label: 'Moderate Confidence',
      color: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
      description: '3–7 days out — trends are useful but details will change. Re-check closer to departure.',
    },
    low: {
      label: 'Low Confidence',
      color: 'text-red-400 bg-red-500/10 border-red-500/30',
      description: '7–10 days out — only general trends. Do NOT make go/no-go decisions on this data.',
    },
    unavailable: {
      label: 'No Forecast Available',
      color: 'text-slate-400 bg-slate-800 border-slate-700',
      description: 'More than 10 days out — no reliable weather forecast exists. Check back closer to your trip.',
    },
  };

  const runAssessment = async () => {
    if (!route) return;
    if (!apiKeys.windy) {
      setError('Windy API key is not configured. Go to Boat Config to add it.');
      return;
    }
    if (confidence === 'unavailable') {
      setError(
        `Departure is ${Math.round(daysUntilDeparture)} days away. Weather forecasts only extend ~10 days. ` +
        `No reliable data exists yet — check back when you're within 7 days of departure.`
      );
      return;
    }
    // If assessment already exists for this departure time, don't re-fetch
    if (assessment && assessment.departureTime === departureTime.getTime()) return;
    setAssessing(true);
    setError(null);
    try {
      const result = await assessRoute({
        route,
        departureTime,
        thresholds: weatherThresholds,
        windyApiKey: apiKeys.windy,
        destinations,
      });
      setAssessment(result);
    } catch (err: any) {
      setError(err.message ?? 'Assessment failed');
    } finally {
      setAssessing(false);
    }
  };

  const findWindows = async () => {
    if (!route) return;
    if (!apiKeys.windy) {
      setError('Windy API key required');
      return;
    }
    // If windows already computed, don't re-fetch — use "Clear cache" to get fresh data
    if (windows.length > 0) return;
    setScanning(true);
    setError(null);
    try {
      const result = await findBestWeatherWindow(route, weatherThresholds, apiKeys.windy, destinations, {
        daysAhead: 7,
        earliestHourOfDay: 6,
        latestHourOfDay: 12,
        stepHours: 2,
      });
      setWindows(result);
    } catch (err: any) {
      setError(err.message ?? 'Window scan failed');
    } finally {
      setScanning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-sea-400 border-t-transparent" />
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="p-4">
        <p className="text-slate-400">Trip not found</p>
        <Link to="/planner/trips" className="mt-4 inline-block text-sea-400">Back</Link>
      </div>
    );
  }

  if (!route) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => navigate(`/planner/trips/${tripId}`)}
            className="rounded p-1.5 text-slate-400 hover:bg-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h2 className="text-xl font-semibold">Assess Trip</h2>
        </div>
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4 text-amber-300">
          <p className="font-medium">No route assigned</p>
          <p className="mt-1 text-sm">
            Add a route to this trip before running a weather assessment.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-800 bg-slate-900/95 p-3 backdrop-blur-sm">
        <button
          onClick={() => navigate(`/planner/trips/${tripId}`)}
          className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-slate-100">Weather Assessment</h2>
          <p className="text-xs text-slate-400">{trip.name} · {route.name}</p>
        </div>
      </div>

      <div className="space-y-5 p-4">
        {/* Departure picker */}
        <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
            Planned Departure
          </h3>
          <input
            type="datetime-local"
            value={format(departureTime, "yyyy-MM-dd'T'HH:mm")}
            onChange={(e) => {
              setDepartureTime(new Date(e.target.value));
              setAssessment(null);
              setError(null);
            }}
            className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500"
          />

          {/* Forecast confidence indicator */}
          {(() => {
            const info = confidenceInfo[confidence];
            return (
              <div className={`mt-3 rounded-lg border p-3 ${info.color}`}>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  {confidence === 'high' && <CheckCircle2 className="h-4 w-4" />}
                  {confidence === 'moderate' && <AlertTriangle className="h-4 w-4" />}
                  {confidence === 'low' && <AlertTriangle className="h-4 w-4" />}
                  {confidence === 'unavailable' && <XCircle className="h-4 w-4" />}
                  {info.label}
                  {daysUntilDeparture > 0 && (
                    <span className="ml-auto text-xs font-normal opacity-75">
                      {Math.round(daysUntilDeparture)} days out
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs opacity-80">{info.description}</p>
              </div>
            );
          })()}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={runAssessment}
              disabled={
                assessing ||
                !apiKeys.windy ||
                confidence === 'unavailable' ||
                (assessment !== null && assessment.departureTime === departureTime.getTime())
              }
              className="flex items-center gap-1.5 rounded-lg bg-sea-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sea-700 disabled:opacity-40"
            >
              {assessing ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Fetching forecast...
                </>
              ) : confidence === 'unavailable' ? (
                <>
                  <XCircle className="h-4 w-4" />
                  Too far out
                </>
              ) : assessment && assessment.departureTime === departureTime.getTime() ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Assessed (see below)
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Assess this time
                </>
              )}
            </button>
            <button
              onClick={findWindows}
              disabled={scanning || !apiKeys.windy || windows.length > 0}
              className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-40"
            >
              {scanning ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Scanning forecasts...
                </>
              ) : windows.length > 0 ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Windows loaded (see below)
                </>
              ) : (
                <>
                  <TrendingUp className="h-4 w-4" />
                  Find best windows (7 days)
                </>
              )}
            </button>
          </div>
          {(assessment || windows.length > 0) && (
            <div className="mt-3 flex items-center justify-between">
              <p className="text-[11px] text-slate-500">
                {assessment
                  ? `Forecast data from ${format(new Date(assessment.dataFetchedAt), 'h:mm a, MMM d')}. `
                  : ''}
                Results are locked until you refresh.
              </p>
              <button
                onClick={async () => {
                  await clearWindyCache();
                  setAssessment(null);
                  setWindows([]);
                  setError(null);
                }}
                className="flex items-center gap-1.5 rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                title="Discard current results and fetch fresh forecast data from Windy"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh forecast data
              </button>
            </div>
          )}

          {!apiKeys.windy && (
            <p className="mt-3 rounded bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
              Windy API key not configured.{' '}
              <Link to="/planner/boat" className="underline">Add it in Boat Config</Link>.
            </p>
          )}
          {error && (
            <p className="mt-3 rounded bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>
          )}
        </section>

        {/* Weather Windows */}
        {windows.length > 0 && (
          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
              Best Departure Windows (next 7 days)
            </h3>
            <div className="space-y-2">
              {windows.slice(0, 6).map((w, i) => {
                const style = RATING_COLORS[w.rating];
                const Icon = style.icon;
                return (
                  <button
                    key={w.departureTime}
                    onClick={() => {
                      setDepartureTime(new Date(w.departureTime));
                      setWindows([]);
                    }}
                    className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:border-slate-600 ${style.border} ${style.bg}`}
                  >
                    <div className="text-xs font-bold text-slate-500">#{i + 1}</div>
                    <Icon className={`h-5 w-5 ${style.text}`} />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-100">
                        {format(new Date(w.departureTime), 'EEE MMM d, h:mm a')}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-400">
                        Wind max {w.maxWind.toFixed(0)} kt · Waves {w.maxWave.toFixed(1)} ft · {w.hoursOfConcern}h concern
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${style.bg} ${style.text}`}>
                      {style.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Assessment Results */}
        {assessment && (
          <>
            {/* Verdict */}
            <section className={`rounded-lg border p-4 ${RATING_COLORS[assessment.overallRating].border} ${RATING_COLORS[assessment.overallRating].bg}`}>
              <div className="flex items-start gap-3">
                {(() => {
                  const Icon = RATING_COLORS[assessment.overallRating].icon;
                  return <Icon className={`h-8 w-8 shrink-0 ${RATING_COLORS[assessment.overallRating].text}`} />;
                })()}
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className={`text-2xl font-bold ${RATING_COLORS[assessment.overallRating].text}`}>
                      {RATING_COLORS[assessment.overallRating].label}
                    </span>
                    {confidence !== 'high' && confidence !== 'unavailable' && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${confidenceInfo[confidence].color}`}
                      >
                        {confidenceInfo[confidence].label}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate-300">{assessment.recommendation}</p>
                  {confidence === 'moderate' && (
                    <p className="mt-2 text-xs text-amber-400/80">
                      ⚠ This assessment is {Math.round(daysUntilDeparture)} days out. Re-check within 3 days of departure for a reliable go/no-go decision.
                    </p>
                  )}
                  {confidence === 'low' && (
                    <p className="mt-2 text-xs text-red-400/80">
                      ⚠ This assessment is {Math.round(daysUntilDeparture)} days out — only shows general trends. Do NOT make a final go/no-go decision on this. Re-check within 3 days.
                    </p>
                  )}
                  {assessment.waveDataUnavailable && (
                    <p className="mt-2 rounded bg-red-500/10 px-2 py-1 text-xs text-red-400">
                      ⚠ WAVE DATA UNAVAILABLE — wave height could not be retrieved from Windy for this location. The assessment only reflects wind conditions. Check waves separately before departing.
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded bg-slate-900/50 p-2 text-center">
                  <div className="flex items-center justify-center gap-1 text-xs text-slate-500">
                    <Wind className="h-3 w-3" /> Peak Wind
                  </div>
                  <div className="mt-0.5 text-lg font-semibold text-slate-100">
                    {assessment.summary.maxWindKnots.toFixed(0)}
                    <span className="ml-0.5 text-xs text-slate-500">kt</span>
                  </div>
                </div>
                <div className="rounded bg-slate-900/50 p-2 text-center">
                  <div className="flex items-center justify-center gap-1 text-xs text-slate-500">
                    <Wind className="h-3 w-3" /> Peak Gust
                  </div>
                  <div className="mt-0.5 text-lg font-semibold text-slate-100">
                    {assessment.summary.maxGustKnots.toFixed(0)}
                    <span className="ml-0.5 text-xs text-slate-500">kt</span>
                  </div>
                </div>
                <div className="rounded bg-slate-900/50 p-2 text-center">
                  <div className="flex items-center justify-center gap-1 text-xs text-slate-500">
                    <Waves className="h-3 w-3" /> Peak Wave
                  </div>
                  <div className="mt-0.5 text-lg font-semibold text-slate-100">
                    {assessment.summary.maxWaveFt.toFixed(1)}
                    <span className="ml-0.5 text-xs text-slate-500">ft</span>
                  </div>
                </div>
                <div className="rounded bg-slate-900/50 p-2 text-center">
                  <div className="flex items-center justify-center gap-1 text-xs text-slate-500">
                    <Activity className="h-3 w-3" /> Peak Current
                  </div>
                  <div className="mt-0.5 text-lg font-semibold text-slate-100">
                    {assessment.summary.maxCurrentKnots.toFixed(1)}
                    <span className="ml-0.5 text-xs text-slate-500">kt</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Critical Passages — tide timing */}
            {assessment.currentTransits.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
                  Critical Passages (Tide Timing)
                </h3>
                <p className="mb-3 text-xs text-slate-500">
                  Narrow passages with strong currents — time your transit carefully.
                </p>
                <div className="space-y-2">
                  {assessment.currentTransits.map((t) => {
                    const style = RATING_COLORS[t.rating];
                    const Icon = style.icon;
                    return (
                      <div
                        key={t.station.id}
                        className={`rounded-lg border p-3 ${style.border} ${style.bg}`}
                      >
                        <div className="flex items-start gap-3">
                          <Icon className={`h-5 w-5 shrink-0 ${style.text}`} />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold text-slate-100">{t.station.name}</h4>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${style.bg} ${style.text}`}>
                                {style.label}
                              </span>
                            </div>
                            <div className="mt-1 text-xs text-slate-400">
                              ETA {format(new Date(t.arrivalTimestamp), 'EEE HH:mm')}
                              {t.currentAtArrival && (
                                <>
                                  {' · '}
                                  <span className="text-slate-300">
                                    {t.currentAtArrival.absSpeedKnots.toFixed(1)} kt{' '}
                                    {t.currentAtArrival.type}
                                  </span>
                                </>
                              )}
                              {t.minutesFromSlack !== null && (
                                <>
                                  {' · '}
                                  <span className="text-slate-400">
                                    slack {t.minutesFromSlack > 0 ? '+' : ''}
                                    {t.minutesFromSlack} min
                                  </span>
                                </>
                              )}
                            </div>
                            <p className="mt-2 text-xs text-slate-300">{t.recommendation}</p>
                            {t.station.description && (
                              <p className="mt-1 text-[11px] italic text-slate-500">
                                {t.station.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Hourly Timeline */}
            <section>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
                Hourly Timeline
              </h3>
              <div className="space-y-1">
                {assessment.hourly.map((h, i) => {
                  const style = RATING_COLORS[h.overallRating];
                  return (
                    <div
                      key={i}
                      className={`flex items-center gap-3 rounded border-l-4 bg-slate-900 px-3 py-2 text-xs ${
                        h.overallRating === 'go'
                          ? 'border-l-green-500'
                          : h.overallRating === 'caution'
                          ? 'border-l-amber-500'
                          : 'border-l-red-500'
                      }`}
                    >
                      <div className="w-14 shrink-0 text-slate-400">
                        <Clock className="mr-1 inline h-3 w-3" />
                        {format(new Date(h.timestamp), 'HH:mm')}
                      </div>
                      <div className="w-16 shrink-0 text-slate-500">
                        Leg {h.legIndex + 1}
                      </div>
                      <div className="flex-1">
                        {h.windSpeedKnots !== undefined && (
                          <span className="mr-3 text-slate-300">
                            <Wind className="mr-0.5 inline h-3 w-3" />
                            {h.windSpeedKnots.toFixed(0)}
                            {h.gustKnots !== undefined && (
                              <span className="text-slate-500">/{h.gustKnots.toFixed(0)}</span>
                            )}
                            <span className="ml-0.5 text-slate-500">kt</span>
                          </span>
                        )}
                        {h.waveHeightFt !== undefined && h.waveHeightFt > 0 && (
                          <span className="mr-3 text-slate-300">
                            <Waves className="mr-0.5 inline h-3 w-3" />
                            {h.waveHeightFt.toFixed(1)}
                            <span className="ml-0.5 text-slate-500">ft</span>
                          </span>
                        )}
                        {h.currentStationName && h.currentSpeedKnots !== undefined && (
                          <span className="mr-3 text-sea-300" title={h.currentStationName}>
                            <Activity className="mr-0.5 inline h-3 w-3" />
                            {h.currentSpeedKnots.toFixed(1)}
                            <span className="ml-0.5 text-slate-500">
                              kt {h.currentType === 'slack' ? '' : h.currentType?.[0]}
                            </span>
                          </span>
                        )}
                        {h.temperatureF !== undefined && (
                          <span className="text-slate-400">{h.temperatureF.toFixed(0)}°F</span>
                        )}
                      </div>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${style.bg} ${style.text}`}>
                        {style.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Bailout Points — grouped by voyage hour */}
            {assessment.bailoutPoints.length > 0 && (() => {
              const totalHours = assessment.hourly.length;
              const seg1End = totalHours / 3;
              const seg2End = (totalHours / 3) * 2;

              // Sort each segment by distance off route (closest first) so best bailouts show first
              const byDist = (a: typeof assessment.bailoutPoints[number], b: typeof assessment.bailoutPoints[number]) =>
                a.distanceFromRouteNM - b.distanceFromRouteNM;

              const segments = [
                {
                  label: 'Early',
                  hint: `Hours 0–${seg1End.toFixed(0)}`,
                  items: assessment.bailoutPoints
                    .filter((bp) => bp.hoursIntoVoyage < seg1End)
                    .sort(byDist),
                },
                {
                  label: 'Mid-Passage',
                  hint: `Hours ${seg1End.toFixed(0)}–${seg2End.toFixed(0)}`,
                  items: assessment.bailoutPoints
                    .filter(
                      (bp) => bp.hoursIntoVoyage >= seg1End && bp.hoursIntoVoyage < seg2End
                    )
                    .sort(byDist),
                },
                {
                  label: 'Late',
                  hint: `Hours ${seg2End.toFixed(0)}–${totalHours}`,
                  items: assessment.bailoutPoints
                    .filter((bp) => bp.hoursIntoVoyage >= seg2End)
                    .sort(byDist),
                },
              ];

              return (
                <section>
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
                    Bailout Options Along Route
                  </h3>
                  <p className="mb-3 text-xs text-slate-500">
                    Protected harbors within 15 NM of your route — includes cross-sound options
                    (Connecticut coast when sailing the LI shore). Sorted by closest first in each segment.
                  </p>
                  <div className="space-y-4">
                    {segments.map((seg) => (
                      <div key={seg.label}>
                        <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                          <span>{seg.label}</span>
                          <span className="text-slate-600">·</span>
                          <span className="text-slate-500">{seg.hint}</span>
                          <span className="ml-auto rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
                            {seg.items.length}
                          </span>
                        </div>
                        {seg.items.length === 0 ? (
                          <div className="rounded border border-dashed border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-400/80">
                            ⚠ No protected harbor within 15 NM during this segment — open water.
                            If conditions decline here, your options are: turn back, press on to
                            next segment's bailout, or heave-to.
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {seg.items.slice(0, 8).map((bp) => {
                              const distColor =
                                bp.distanceFromRouteNM < 3
                                  ? 'text-green-400'
                                  : bp.distanceFromRouteNM < 8
                                  ? 'text-amber-400'
                                  : 'text-red-400';
                              const divertMin = Math.round(bp.divertTimeHours * 60);
                              return (
                                <Link
                                  key={bp.destination.id}
                                  to={`/planner/destinations/${bp.destination.id}`}
                                  className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900 p-2.5 transition-colors hover:border-slate-700"
                                >
                                  <Anchor className="h-4 w-4 text-sea-400" />
                                  <div className="flex-1">
                                    <div className="text-sm font-medium text-slate-100">
                                      {bp.destination.name}
                                    </div>
                                    <div className="mt-0.5 text-xs text-slate-500 capitalize">
                                      {bp.destination.type.replace('-', ' ')} ·{' '}
                                      <span className={distColor}>
                                        {bp.distanceFromRouteNM.toFixed(1)} NM off route
                                      </span>{' '}
                                      · reachable at hour {bp.hoursIntoVoyage.toFixed(1)} ·{' '}
                                      {divertMin < 60
                                        ? `${divertMin} min to divert`
                                        : `${(divertMin / 60).toFixed(1)}h to divert`}
                                    </div>
                                  </div>
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              );
            })()}

            {/* Route & departure summary */}
            <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
                Route Summary
              </h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-slate-500"><Calendar className="mr-1 inline h-3 w-3" />Departure</div>
                  <div className="text-slate-100">
                    {format(new Date(assessment.departureTime), 'EEE MMM d, h:mm a')}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500"><Calendar className="mr-1 inline h-3 w-3" />Arrival</div>
                  <div className="text-slate-100">
                    {format(new Date(assessment.arrivalTime), 'EEE MMM d, h:mm a')}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500"><NavIcon className="mr-1 inline h-3 w-3" />Distance</div>
                  <div className="text-slate-100">
                    {assessment.totalDistanceNM.toFixed(1)} NM
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500"><Clock className="mr-1 inline h-3 w-3" />Duration</div>
                  <div className="text-slate-100">
                    {assessment.hourly.length}h at {assessment.cruisingSpeedKnots} kt
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
