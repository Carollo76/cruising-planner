import { NavLink, Link } from 'react-router-dom';
import { Map, Navigation, Cloud, Anchor, Shield, MoreHorizontal, Home } from 'lucide-react';

const navItems = [
  { to: '/planner', icon: Map, label: 'Chart', end: true },
  { to: '/planner/routes', icon: Navigation, label: 'Routes', end: false },
  { to: '/planner/weather', icon: Cloud, label: 'Weather', end: false },
  { to: '/planner/destinations', icon: Anchor, label: 'Places', end: false },
  { to: '/planner/safety', icon: Shield, label: 'Safety', end: false },
  { to: '/planner/more', icon: MoreHorizontal, label: 'More', end: false },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-800 bg-slate-900/95 backdrop-blur-sm pb-safe">
      <div className="mx-auto flex max-w-lg items-center justify-around">
        <Link
          to="/"
          className="flex flex-col items-center gap-0.5 px-3 py-2 text-xs text-slate-500 transition-colors hover:text-slate-300"
          title="Back to Well Adjusted home"
        >
          <Home className="h-5 w-5" />
          <span>Home</span>
        </Link>
        {navItems.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-3 py-2 text-xs transition-colors ${
                isActive
                  ? 'text-sea-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`
            }
          >
            <Icon className="h-5 w-5" />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
