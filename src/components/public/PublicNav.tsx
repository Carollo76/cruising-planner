import { useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { Compass, Menu, X } from 'lucide-react';

const navItems = [
  { to: '/', label: 'Home' },
  { to: '/about', label: 'About' },
  { to: '/crew', label: 'Crew' },
  { to: '/gallery', label: 'Gallery' },
  { to: '/blog', label: 'Log' },
  { to: '/planner', label: 'Cruise Planner' },
];

export function PublicNav() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2" onClick={() => setMobileOpen(false)}>
          <Compass className="h-6 w-6 text-sea-400" />
          <div>
            <div className="text-sm font-bold uppercase tracking-wider text-slate-100">
              S/V Well Adjusted
            </div>
            <div className="text-[10px] uppercase tracking-widest text-slate-500">
              Beneteau Oceanis 37 · Huntington, NY
            </div>
          </div>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-sea-600/20 text-sea-300'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-slate-100'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Mobile menu button */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden rounded-lg p-2 text-slate-300 hover:bg-slate-800 hover:text-slate-100"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <nav className="border-t border-slate-800 px-4 py-2 md:hidden">
          {navItems.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-sea-600/20 text-sea-300'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-slate-100'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  );
}
