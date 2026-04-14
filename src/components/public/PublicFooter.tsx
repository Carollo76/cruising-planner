import { Anchor } from 'lucide-react';

export function PublicFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-16 border-t border-slate-800 bg-slate-950 py-8">
      <div className="mx-auto max-w-6xl px-4 text-center">
        <div className="flex items-center justify-center gap-2 text-slate-400">
          <Anchor className="h-4 w-4" />
          <span className="text-sm font-medium">S/V Well Adjusted</span>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Beneteau Oceanis 37 · Hailing from Huntington, NY · Moored at Centerport Yacht Club
        </p>
        <p className="mt-3 text-xs text-slate-600">© {year} The Carollo Family</p>
      </div>
    </footer>
  );
}
