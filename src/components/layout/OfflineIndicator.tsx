import { Wifi, WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  return (
    <div
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        isOnline
          ? 'bg-green-500/10 text-green-400'
          : 'bg-amber-500/10 text-amber-400'
      }`}
    >
      {isOnline ? (
        <>
          <Wifi className="h-3.5 w-3.5" />
          <span>Online</span>
        </>
      ) : (
        <>
          <WifiOff className="h-3.5 w-3.5" />
          <span>Offline</span>
        </>
      )}
    </div>
  );
}
