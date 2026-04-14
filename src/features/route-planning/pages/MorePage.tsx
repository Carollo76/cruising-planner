import { Link } from 'react-router-dom';
import {
  Compass,
  Sailboat,
  Users,
  Clock,
  ShoppingCart,
  BookOpen,
} from 'lucide-react';

const moreItems = [
  { to: '/planner/trips', icon: Compass, label: 'Trips', description: 'Plan voyages with routes, crew, and provisions' },
  { to: '/planner/boat', icon: Sailboat, label: 'Boat Config', description: 'Vessel specs and details' },
  { to: '/planner/crew', icon: Users, label: 'Crew', description: 'Manage crew roster' },
  { to: '/planner/watch', icon: Clock, label: 'Watch Schedule', description: 'Overnight watch rotation' },
  { to: '/planner/provisioning', icon: ShoppingCart, label: 'Provisioning', description: 'Meals, water, fuel planning' },
  { to: '/planner/logbook', icon: BookOpen, label: 'Logbook', description: 'Digital voyage log' },
];

export function MorePage() {
  return (
    <div className="p-4">
      <h2 className="mb-4 text-xl font-semibold">More</h2>
      <div className="space-y-2">
        {moreItems.map(({ to, icon: Icon, label, description }) => (
          <Link
            key={to}
            to={to}
            className="flex items-center gap-4 rounded-lg border border-slate-800 bg-slate-900 p-4 transition-colors hover:border-slate-700"
          >
            <Icon className="h-5 w-5 text-slate-400" />
            <div>
              <h3 className="font-medium text-slate-100">{label}</h3>
              <p className="text-xs text-slate-500">{description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
