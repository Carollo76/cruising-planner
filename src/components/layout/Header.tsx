import { Compass } from 'lucide-react';
import { OfflineIndicator } from './OfflineIndicator';

interface HeaderProps {
  title?: string;
}

export function Header({ title = 'Cruising Planner' }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900/95 backdrop-blur-sm">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Compass className="h-6 w-6 text-sea-400" />
          <h1 className="text-lg font-semibold text-slate-100">{title}</h1>
        </div>
        <OfflineIndicator />
      </div>
    </header>
  );
}
