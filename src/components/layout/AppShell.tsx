import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { BottomNav } from './BottomNav';

interface AppShellProps {
  title?: string;
  hideHeader?: boolean;
}

export function AppShell({ title, hideHeader }: AppShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-slate-950 text-slate-100">
      {!hideHeader && <Header title={title} />}
      <main className="flex-1 pb-16">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
