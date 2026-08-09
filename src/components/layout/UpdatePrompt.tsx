import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { registerSW } from 'virtual:pwa-register';

/** How often a long-open tab asks the server whether a newer build exists. */
const UPDATE_CHECK_MS = 60_000;

/**
 * Tells the user when a newer build is available and lets them take it.
 *
 * The service worker precaches the app shell, so an open tab keeps serving the bundle it
 * started with. Without this, shipping a fix did not reach anyone still holding the page
 * open — and there was no way to tell a stale bundle from a bug.
 */
export function UpdatePrompt() {
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [update, setUpdate] = useState<(() => Promise<void>) | null>(null);

  useEffect(() => {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        setNeedsRefresh(true);
      },
      onRegisteredSW(_swUrl, registration) {
        if (!registration) return;
        // Poll, so a tab left open across a deploy still notices.
        setInterval(() => void registration.update().catch(() => undefined), UPDATE_CHECK_MS);
      },
    });
    setUpdate(() => () => updateSW(true));
  }, []);

  if (!needsRefresh) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-3 bg-sea-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
      <RefreshCw className="h-4 w-4" />
      <span>A new version of the planner is ready.</span>
      <button
        onClick={() => void update?.()}
        className="rounded bg-white/20 px-3 py-1 text-xs font-semibold hover:bg-white/30"
      >
        Reload now
      </button>
    </div>
  );
}
