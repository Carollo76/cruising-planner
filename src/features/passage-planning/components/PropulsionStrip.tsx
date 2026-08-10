import { useState } from 'react';
import { Sailboat, Fuel, Wind, CircleHelp } from 'lucide-react';
import type { LegPropulsionAdvice, PropulsionSummary } from '../logic/propulsion';

/**
 * Sail / motor / motorsail per leg, with the reason on tap.
 *
 * The recommendation is a word; the reason is the product. Both are always shown, and
 * confidence is stated rather than implied — the spec is blunt that rendering a green
 * SAIL badge with false authority beyond three days is the failure mode to avoid.
 */

const ICONS = {
  sail: Sailboat,
  motor: Fuel,
  motorsail: Wind,
  unknown: CircleHelp,
} as const;

const STYLES = {
  sail: 'bg-green-500 text-slate-950',
  motor: 'bg-amber-500 text-slate-950',
  motorsail: 'bg-sky-500 text-slate-950',
  unknown: 'bg-slate-600 text-white',
} as const;

const LABELS = {
  sail: 'SAIL',
  motor: 'MOTOR',
  motorsail: 'MOTORSAIL',
  unknown: 'NO ADVICE',
} as const;

export function PropulsionStrip({
  advice,
  summary,
  fuelCapacityGal,
}: {
  advice: LegPropulsionAdvice[];
  summary: PropulsionSummary;
  fuelCapacityGal: number;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const overRange = summary.fuelGal > fuelCapacityGal;

  return (
    <section className="rounded-lg border border-slate-700 bg-slate-900 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Sailboat className="h-4 w-4 text-sea-400" />
        <h3 className="flex-1 text-sm font-semibold text-slate-100">Sail or motor</h3>
        <span
          className={`rounded px-2 py-0.5 text-xs font-bold ${
            summary.confidence === 'high'
              ? 'bg-green-500 text-slate-950'
              : summary.confidence === 'medium'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-600 text-white'
          }`}
        >
          {summary.confidence.toUpperCase()} CONFIDENCE
        </span>
      </div>

      <p className="mb-2 text-sm text-slate-300">
        {summary.sailingNm.toFixed(0)} NM sailing · {summary.motoringNm.toFixed(0)} NM motoring ·{' '}
        {summary.motorsailingNm.toFixed(0)} NM motorsailing ·{' '}
        <span className={overRange ? 'font-semibold text-red-300' : ''}>
          {summary.fuelGal.toFixed(1)} gal
        </span>
      </p>

      {overRange && (
        <p className="mb-2 rounded border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-xs font-medium text-red-200">
          Recommended motoring needs {summary.fuelGal.toFixed(1)} gal against a{' '}
          {fuelCapacityGal.toFixed(0)} gal tank — plan a fuel stop.
        </p>
      )}

      {summary.confidence === 'low' && (
        <p className="mb-2 text-xs text-amber-300">
          Beyond about three days a wind forecast is a planning hint, not a schedule. Treat these
          as indicative and re-check nearer the day.
        </p>
      )}

      {summary.unknownLegs > 0 && (
        <p className="mb-2 text-xs text-slate-400">
          {summary.unknownLegs} leg(s) could not be advised on — tap them for the reason.
        </p>
      )}

      <div className="space-y-1">
        {advice.map((leg, index) => {
          const Icon = ICONS[leg.recommendation];
          const isOpen = open === leg.legId;
          return (
            <div key={leg.legId} className="rounded border border-slate-800 bg-slate-950">
              <button
                onClick={() => setOpen(isOpen ? null : leg.legId)}
                className="flex w-full items-center gap-2 px-2 py-2 text-left"
              >
                <span className="w-6 shrink-0 text-xs font-medium text-slate-500">{index + 1}</span>
                <Icon className="h-4 w-4 shrink-0 text-slate-300" />
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-bold ${STYLES[leg.recommendation]}`}
                >
                  {LABELS[leg.recommendation]}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-slate-400">
                  {leg.trueWindSpeed !== null
                    ? `${Math.round(leg.trueWindSpeed)} kn at ${Math.round(leg.trueWindAngle ?? 0)}°`
                    : 'no wind data'}
                </span>
                <span className="shrink-0 text-xs text-slate-500">{isOpen ? '▾' : '▸'}</span>
              </button>

              {isOpen && (
                <div className="border-t border-slate-800 px-3 py-2">
                  <p className="text-sm text-slate-200">{leg.reason}</p>
                  <dl className="mt-1.5 grid grid-cols-2 gap-x-3 text-xs text-slate-400">
                    {leg.polarBoatSpeed !== null && (
                      <div>
                        <dt className="inline">Polar speed: </dt>
                        <dd className="inline text-slate-200">{leg.polarBoatSpeed.toFixed(1)} kn</dd>
                      </div>
                    )}
                    {leg.requiredSpeed !== null && (
                      <div>
                        <dt className="inline">Needed: </dt>
                        <dd className="inline text-slate-200">{leg.requiredSpeed.toFixed(1)} kn</dd>
                      </div>
                    )}
                    {leg.estimatedFuelGal > 0 && (
                      <div>
                        <dt className="inline">Fuel: </dt>
                        <dd className="inline text-slate-200">{leg.estimatedFuelGal.toFixed(2)} gal</dd>
                      </div>
                    )}
                    {leg.tackingOption && (
                      <div className="col-span-2">
                        <dt className="inline">Beating costs: </dt>
                        <dd className="inline text-slate-200">
                          +{leg.tackingOption.extraDistanceNm.toFixed(1)} NM,{' '}
                          +{leg.tackingOption.extraTimeMin} min
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-xs text-slate-500">
        Speeds are an ORC VPP estimate from a certificated sister ship — not measured from your
        boat.
      </p>
    </section>
  );
}
