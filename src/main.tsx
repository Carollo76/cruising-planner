import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { seedDatabase } from './db/seed';
import './index.css';

seedDatabase().catch(console.error);

/**
 * Ask the browser to keep planner data durable.
 *
 * By default IndexedDB is "best effort" and can be evicted under storage pressure —
 * for a trip planned months ahead that is a real risk, and there is no server copy to
 * fall back on. Granting is at the browser's discretion; this only ever improves the
 * odds, so failures are ignored.
 */
if (navigator.storage?.persist) {
  navigator.storage
    .persisted()
    .then((already) => (already ? true : navigator.storage.persist()))
    .catch(() => undefined);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
