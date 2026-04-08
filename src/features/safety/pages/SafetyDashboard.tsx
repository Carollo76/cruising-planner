import { Link } from 'react-router-dom';
import {
  ClipboardCheck,
  FileText,
  Phone,
  AlertTriangle,
  Users,
  LifeBuoy,
} from 'lucide-react';

const safetyItems = [
  {
    to: '/safety/checklists',
    icon: ClipboardCheck,
    label: 'Checklists',
    description: 'Pre-departure, underway, arrival, heavy weather',
    color: 'text-green-400 bg-green-500/10',
  },
  {
    to: '/safety/float-plan',
    icon: FileText,
    label: 'Float Plan',
    description: 'Generate and share your float plan',
    color: 'text-blue-400 bg-blue-500/10',
  },
  {
    to: '/safety/emergency',
    icon: Phone,
    label: 'Emergency Contacts',
    description: 'Coast Guard, TowBoatUS, medical',
    color: 'text-red-400 bg-red-500/10',
  },
  {
    to: '/safety/mob',
    icon: LifeBuoy,
    label: 'Man Overboard',
    description: 'MOB procedure quick reference',
    color: 'text-amber-400 bg-amber-500/10',
  },
  {
    to: '/safety/briefing',
    icon: Users,
    label: 'Crew Briefing',
    description: 'Safety briefing template for your crew',
    color: 'text-purple-400 bg-purple-500/10',
  },
  {
    to: '/safety/equipment',
    icon: AlertTriangle,
    label: 'Safety Equipment',
    description: 'Inventory and inspection tracking',
    color: 'text-teal-400 bg-teal-500/10',
  },
];

export function SafetyDashboard() {
  return (
    <div className="p-4">
      <h2 className="mb-4 text-xl font-semibold">Safety</h2>
      <div className="grid gap-3">
        {safetyItems.map(({ to, icon: Icon, label, description, color }) => (
          <Link
            key={to}
            to={to}
            className="flex items-center gap-4 rounded-lg border border-slate-800 bg-slate-900 p-4 transition-colors hover:border-slate-700"
          >
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-medium text-slate-100">{label}</h3>
              <p className="mt-0.5 text-xs text-slate-400">{description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
