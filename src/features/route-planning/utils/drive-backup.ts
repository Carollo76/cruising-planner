import { useSettingsStore } from '../../../stores/settings-store';
import { buildBackup, backupFilename } from './backup';
import {
  ensureBackupFolder,
  getAccessToken,
  listBackups,
  uploadBackup,
  type DriveBackupFile,
} from '../../../services/google-drive';

const LAST_RUN_KEY = 'cruisingPlanner.driveLastBackup';

/** Don't upload more than this often on load — Drive history should be useful, not noise. */
const MIN_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export function lastBackupAt(): number {
  return Number(localStorage.getItem(LAST_RUN_KEY) ?? '0');
}

function markBackedUp(when: number): void {
  localStorage.setItem(LAST_RUN_KEY, String(when));
}

/** Builds the current backup and pushes it to Drive with an already-valid token. */
export async function backupToDrive(token: string): Promise<DriveBackupFile> {
  const folderId = await ensureBackupFolder(token);
  const backup = await buildBackup();
  const file = await uploadBackup(
    token,
    folderId,
    JSON.stringify(backup, null, 2),
    backupFilename(backup.exportedAt)
  );
  markBackedUp(Date.now());
  return file;
}

export async function fetchDriveBackups(token: string): Promise<DriveBackupFile[]> {
  return listBackups(token, await ensureBackupFolder(token));
}

/**
 * Best-effort automatic backup, run once when the planner starts.
 *
 * Deliberately silent in every failure mode: it must never pop a sign-in window the user
 * did not ask for, and must never block or interrupt planning. If a token cannot be had
 * without UI, it simply does nothing until the user next opens Backup & Restore.
 */
export async function maybeAutoBackup(): Promise<void> {
  const { driveAutoBackup, apiKeys } = useSettingsStore.getState();
  const clientId = apiKeys.googleClientId;
  if (!driveAutoBackup || !clientId) return;
  if (Date.now() - lastBackupAt() < MIN_INTERVAL_MS) return;
  if (!navigator.onLine) return;

  try {
    const token = await getAccessToken(clientId, { interactive: false });
    await backupToDrive(token);
  } catch {
    // Silent by design — surfaced on the Backup page instead.
  }
}
