import { Outlet } from 'react-router-dom';
import { PublicNav } from './PublicNav';
import { PublicFooter } from './PublicFooter';

export function PublicLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-slate-950 text-slate-100">
      <PublicNav />
      <main className="flex-1">
        <Outlet />
      </main>
      <PublicFooter />
    </div>
  );
}
