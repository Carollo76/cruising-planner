import { formatLocalTime, type Utc } from '../../../utils/time';
import type { CurrentPredictionRecord } from '../../../types/currents';
import { interpolateVelocity, timelineEvents } from '../logic/current-source';
import type { ConstraintOutcome } from '../model/constraints';

/**
 * A day of current at one gate, with the projected arrival marked on it.
 *
 * Built for a phone in sunlight on a moving boat: saturated fills, no thin grey type, and
 * the arrival marker is a solid bar rather than a hairline. The colour carries the
 * verdict, but never alone — every state is also labelled in words, because a red/green
 * distinction is the first thing to fail in glare or for a colour-blind crew member.
 */

interface GateTimelineProps {
  label: string;
  record: CurrentPredictionRecord;
  /** Where the boat is projected to be at this gate. */
  outcome?: ConstraintOutcome;
  /** Local day the band covers. */
  dayStart: Utc;
  /**
   * Which phase helps this boat through this gate, derived from the transit course
   * against the station's own flood/ebb axis. Passed in rather than guessed from the
   * verdict text, which was fragile and simply wrong for a westbound transit.
   */
  favourable: 'flood' | 'ebb';
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Colour for a signed velocity, from the boat's point of view. */
function bandColour(velocityKn: number, favourablePositive: boolean): string {
  const helping = favourablePositive ? velocityKn > 0 : velocityKn < 0;
  const strength = Math.abs(velocityKn);
  if (strength < 0.3) return '#64748b'; // slack — slate
  if (helping) return strength > 1.5 ? '#22c55e' : '#4ade80'; // green
  if (strength >= 2.5) return '#ef4444'; // hard foul — red
  if (strength >= 1.0) return '#f59e0b'; // foul — amber
  return '#a3a3a3'; // weak foul — neutral
}

export function GateTimeline({ label, record, outcome, dayStart, favourable }: GateTimelineProps) {
  // Sample the band at 10-minute resolution; finer than any pixel on a phone.
  const samples: Array<{ fraction: number; velocityKn: number }> = [];
  for (let t = 0; t <= DAY_MS; t += 10 * 60 * 1000) {
    const velocity = interpolateVelocity(record, dayStart + t);
    if (velocity !== null) samples.push({ fraction: t / DAY_MS, velocityKn: velocity });
  }

  // NOAA signs flood positive, so a flood-favourable transit wants the positive side.
  const favourablePositive = favourable === 'flood';
  const marks = timelineEvents(record);
  const arrivalFraction = outcome ? (outcome.at - dayStart) / DAY_MS : null;

  const status = outcome?.verdict.status;
  const statusText =
    status === 'ok'
      ? 'FAIR'
      : status === 'caution'
        ? 'FOUL'
        : status === 'fail'
          ? 'NO GO'
          : 'NOT ASSESSED';
  const statusClass =
    status === 'ok'
      ? 'bg-green-500 text-slate-950'
      : status === 'caution'
        ? 'bg-amber-500 text-slate-950'
        : status === 'fail'
          ? 'bg-red-500 text-white'
          : 'bg-slate-600 text-white';

  return (
    <section className="rounded-lg border border-slate-700 bg-slate-900 p-3">
      <div className="mb-2 flex items-center gap-2">
        <h4 className="flex-1 text-base font-semibold text-slate-100">{label}</h4>
        <span className={`rounded px-2 py-0.5 text-xs font-bold tracking-wide ${statusClass}`}>
          {statusText}
        </span>
      </div>

      {/* The band */}
      <div className="relative h-12 w-full overflow-hidden rounded bg-slate-950">
        <div className="flex h-full w-full">
          {samples.map((s, i) => (
            <div
              key={i}
              className="h-full flex-1"
              style={{ backgroundColor: bandColour(s.velocityKn, favourablePositive) }}
            />
          ))}
        </div>

        {/* Slack and peak markers */}
        {marks.map((m, i) => {
          const fraction = (m.at - dayStart) / DAY_MS;
          if (fraction < 0 || fraction > 1) return null;
          return (
            <div
              key={i}
              className="absolute top-0 h-full border-l border-slate-950/60"
              style={{ left: `${fraction * 100}%` }}
              title={`${m.kind} ${Math.abs(m.velocityKn).toFixed(1)} kn at ${formatLocalTime(m.at)}`}
            />
          );
        })}

        {/* Projected arrival */}
        {arrivalFraction !== null && arrivalFraction >= 0 && arrivalFraction <= 1 && (
          <div
            className="absolute top-0 h-full w-1 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.9)]"
            style={{ left: `calc(${arrivalFraction * 100}% - 2px)` }}
          />
        )}
      </div>

      {/* Hour ticks */}
      <div className="mt-1 flex justify-between text-xs font-medium text-slate-400">
        {[0, 6, 12, 18, 24].map((h) => (
          <span key={h}>{String(h % 24).padStart(2, '0')}</span>
        ))}
      </div>

      {outcome && (
        <p className="mt-2 text-sm font-medium text-slate-200">
          Arrive {formatLocalTime(outcome.at)} — {outcome.verdict.detail}
        </p>
      )}

      {outcome?.verdict.status === 'fail' && (
        <ul className="mt-1 list-inside list-disc text-xs text-red-300">
          {outcome.verdict.remedies.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
