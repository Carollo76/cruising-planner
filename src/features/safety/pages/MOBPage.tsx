import { AlertTriangle, LifeBuoy } from 'lucide-react';

const mobSteps = [
  { step: 1, title: 'SHOUT', detail: '"Man Overboard!" — point at the person in the water and never lose sight' },
  { step: 2, title: 'THROW', detail: 'Throw a life ring, cushion, or anything that floats toward the person' },
  { step: 3, title: 'MARK', detail: 'Press MOB button on GPS/chartplotter to mark the position' },
  { step: 4, title: 'MANEUVER', detail: 'Under sail: heave to or tack. Under power: Williamson Turn — turn hard toward the side they fell, go 60° past reciprocal, turn back' },
  { step: 5, title: 'CALL', detail: 'VHF Ch 16: "MAYDAY, MAYDAY, MAYDAY — Man overboard" — give position, vessel name, description of person' },
  { step: 6, title: 'RECOVER', detail: 'Approach from downwind. Use a swim ladder, halyard, or MOB recovery device. Watch for hypothermia.' },
  { step: 7, title: 'FIRST AID', detail: 'Check breathing, treat for hypothermia (remove wet clothes, warm blankets), monitor for secondary drowning' },
];

export function MOBPage() {
  return (
    <div className="p-4">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10">
          <LifeBuoy className="h-5 w-5 text-red-400" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Man Overboard</h2>
          <p className="text-sm text-slate-400">Emergency procedure</p>
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
        <div className="flex items-center gap-2 text-red-400">
          <AlertTriangle className="h-5 w-5" />
          <span className="text-sm font-semibold">IMMEDIATE ACTION REQUIRED</span>
        </div>
        <p className="mt-1 text-xs text-red-300">
          Do not lose sight of the person. Assign a spotter immediately.
        </p>
      </div>

      <div className="space-y-3">
        {mobSteps.map(({ step, title, detail }) => (
          <div key={step} className="flex gap-3 rounded-lg border border-slate-800 bg-slate-900 p-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-sm font-bold text-red-400">
              {step}
            </div>
            <div>
              <h3 className="font-semibold text-slate-100">{title}</h3>
              <p className="mt-0.5 text-sm text-slate-400">{detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
