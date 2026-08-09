import { db } from '../../../db/database';
import { useSettingsStore } from '../../../stores/settings-store';

/**
 * Whole-planner backup to a single JSON file.
 *
 * All planner data lives in this browser's IndexedDB with no server behind it, so a
 * different browser, device or profile sees an empty database — and clearing site data
 * wipes it permanently. This is the way to carry a trip to another machine and the only
 * real backup that exists.
 */

export const BACKUP_FORMAT = 'cruising-planner-backup';
export const BACKUP_VERSION = 1;

/** Zustand persists boat fleet, home port, thresholds and API keys here. */
const SETTINGS_KEY = 'cruising-planner-settings';

/**
 * User-created data worth carrying between browsers. The weather, tide and Windy
 * caches are deliberately excluded — they are large, they expire on their own, and
 * stale forecast data is exactly what should not be restored onto another machine.
 */
export const BACKED_UP_TABLES = [
  'trips',
  'routes',
  'destinations',
  'reviews',
  'crewMembers',
  'checklists',
  'checklistRuns',
  'floatPlans',
  'watchSchedules',
  'provisionPlans',
  'logEntries',
  'boatConfigs',
  'blogPosts',
] as const;

export type BackedUpTable = (typeof BACKED_UP_TABLES)[number];

export interface Backup {
  format: string;
  version: number;
  exportedAt: string;
  settings: unknown | null;
  data: Record<string, unknown[]>;
}

/** Human-facing labels for the counts shown before and after a restore. */
export const TABLE_LABELS: Record<BackedUpTable, string> = {
  trips: 'Trips',
  routes: 'Routes',
  destinations: 'Places',
  reviews: 'Reviews',
  crewMembers: 'Crew',
  checklists: 'Checklists',
  checklistRuns: 'Checklist runs',
  floatPlans: 'Float plans',
  watchSchedules: 'Watch schedules',
  provisionPlans: 'Provisioning plans',
  logEntries: 'Logbook entries',
  boatConfigs: 'Saved boats',
  blogPosts: 'Blog posts',
};

export async function buildBackup(): Promise<Backup> {
  const data: Record<string, unknown[]> = {};
  for (const table of BACKED_UP_TABLES) {
    data[table] = await db.table(table).toArray();
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: currentSettings(),
    data,
  };
}

/**
 * The persisted settings blob, in the shape zustand expects to rehydrate from.
 *
 * Reads localStorage first, but falls back to live store state: zustand only writes on
 * the first change, so someone who never touched a setting would otherwise export a
 * backup with no boats in it at all.
 */
function currentSettings(): unknown {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      // Corrupt settings should not sink the rest of the backup — fall through.
    }
  }

  const { boats, activeBoatId, boatConfig, homePort, weatherThresholds, apiKeys, theme, units } =
    useSettingsStore.getState();
  return {
    state: { boats, activeBoatId, boatConfig, homePort, weatherThresholds, apiKeys, theme, units },
    version: 1,
  };
}

/** Counts per table, for showing what a file holds without importing it. */
export function summarise(backup: Backup): Array<{ table: BackedUpTable; count: number }> {
  return BACKED_UP_TABLES.map((table) => ({
    table,
    count: Array.isArray(backup.data?.[table]) ? backup.data[table].length : 0,
  })).filter((row) => row.count > 0);
}

export function downloadBackup(backup: Backup): void {
  const date = backup.exportedAt.slice(0, 10);
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cruising-planner-backup-${date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Parses and validates a backup file, throwing a plain-language error if it is not one. */
export function parseBackup(text: string): Backup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('that file is not valid JSON — pick a backup file exported from this planner');
  }

  const backup = parsed as Partial<Backup>;
  if (backup?.format !== BACKUP_FORMAT) {
    throw new Error('that file is not a Cruising Planner backup');
  }
  if (typeof backup.version !== 'number' || backup.version > BACKUP_VERSION) {
    throw new Error(
      `that backup was made by a newer version of the planner (file v${String(backup.version)}, this app reads v${BACKUP_VERSION})`
    );
  }
  if (!backup.data || typeof backup.data !== 'object') {
    throw new Error('that backup file has no data in it');
  }
  return backup as Backup;
}

export interface RestoreResult {
  restored: Array<{ table: BackedUpTable; count: number }>;
  settingsRestored: boolean;
}

/**
 * Writes a backup into IndexedDB.
 *
 * `replace: false` merges — rows with the same id are overwritten, anything already
 * here and absent from the file is left alone. `replace: true` empties each table
 * first, so the browser ends up matching the file exactly.
 */
export async function restoreBackup(
  backup: Backup,
  { replace }: { replace: boolean }
): Promise<RestoreResult> {
  const restored: Array<{ table: BackedUpTable; count: number }> = [];

  for (const table of BACKED_UP_TABLES) {
    const rows = backup.data?.[table];
    if (!Array.isArray(rows)) continue;

    const target = db.table(table);
    if (replace) await target.clear();
    if (rows.length > 0) await target.bulkPut(rows);
    if (rows.length > 0) restored.push({ table, count: rows.length });
  }

  let settingsRestored = false;
  if (backup.settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(backup.settings));
    settingsRestored = true;
  }

  return { restored, settingsRestored };
}
