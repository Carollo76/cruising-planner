import { NavLink } from 'react-router-dom';
import { Map, Navigation, Cloud, Anchor, Shield, MoreHorizontal } from 'lucide-react';

const navItems = [
  { to: '/', icon: Map, label: 'Chart' },
  { to: '/routes', icon: Navigation, label: 'Routes' },
  { to: '/weather', icon: Cloud, label: 'Weather' },
  { to: '/destinations', icon: Anchor, label: 'Places' },
  { to: '/safety', icon: Shield, label: 'Safety' },
  { to: '/more', icon: MoreHorizontal, label: 'More' },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-800 bg-slate-900/95 backdrop-blur-sm pb-safe">
      <div className="mx-auto flex max-w-lg items-center justify-around">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
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
