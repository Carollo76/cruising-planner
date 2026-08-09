import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Download,
  Upload,
  AlertTriangle,
  CheckCircle2,
  Database,
  Cloud,
  CloudUpload,
  RefreshCw,
  LogOut,
} from 'lucide-react';
import {
  buildBackup,
  downloadBackup,
  parseBackup,
  restoreBackup,
  summarise,
  TABLE_LABELS,
  type BackedUpTable,
} from '../utils/backup';
import { useSettingsStore } from '../../../stores/settings-store';
import { backupToDrive, fetchDriveBackups, lastBackupAt } from '../utils/drive-backup';
import {
  getAccessToken,
  downloadBackupFile,
  revokeAccess,
  hasLiveToken,
  preloadGoogleSignIn,
  type DriveBackupFile,
} from '../../../services/google-drive';

export function BackupPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [contents, setContents] = useState<Array<{ table: BackedUpTable; count: number }>>([]);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [persisted, setPersisted] = useState<boolean | null>(null);

  /* ── Google Drive ── */
  const { apiKeys, setApiKey, driveAutoBackup, setDriveAutoBackup } = useSettingsStore();
  const [clientId, setClientId] = useState(apiKeys.googleClientId ?? '');
  const [connected, setConnected] = useState(hasLiveToken());
  const [driveFiles, setDriveFiles] = useState<DriveBackupFile[]>([]);
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [driveMessage, setDriveMessage] = useState<string | null>(null);

  const withDrive = async (fn: (token: string) => Promise<void>, interactive = false) => {
    setDriveBusy(true);
    setDriveError(null);
    setDriveMessage(null);
    try {
      const id = (apiKeys.googleClientId ?? '').trim();
      if (!id) throw new Error('add your Google client ID first');
      const token = await getAccessToken(id, { interactive });
      await fn(token);
      setConnected(true);
    } catch (err) {
      setDriveError((err as Error).message);
    } finally {
      setDriveBusy(false);
    }
  };

  const connectDrive = () =>
    withDrive(async (token) => {
      setDriveFiles(await fetchDriveBackups(token));
      setDriveMessage('Connected to Google Drive.');
    }, true);

  const backupNow = () =>
    withDrive(async (token) => {
      const file = await backupToDrive(token);
      setDriveFiles(await fetchDriveBackups(token));
      setDriveMessage(`Backed up to Drive as ${file.name}`);
    });

  const refreshDrive = () =>
    withDrive(async (token) => {
      setDriveFiles(await fetchDriveBackups(token));
    });

  const restoreFromDrive = (file: DriveBackupFile) =>
    withDrive(async (token) => {
      const text = await downloadBackupFile(token, file.id);
      const backup = parseBackup(text);
      const total = summarise(backup).reduce((s, r) => s + r.count, 0);
      if (!confirm(`Restore ${total} records from ${file.name} into this browser?`)) return;
      await restoreBackup(backup, { replace: false });
      setDriveMessage(`Restored from ${file.name}. Reloading…`);
      setTimeout(() => window.location.reload(), 1200);
    });

  const disconnectDrive = () => {
    revokeAccess();
    setConnected(false);
    setDriveFiles([]);
    setDriveAutoBackup(false);
    setDriveMessage('Disconnected. The app can no longer reach your Drive.');
  };

  // Show what is actually in this browser, so it is obvious whether a backup is worth taking.
  useEffect(() => {
    buildBackup()
      .then((b) => setContents(summarise(b)))
      .catch((err) => setError(`Could not read local data: ${(err as Error).message}`));

    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));

    // Get Google's script in place before the user can click Connect, so the popup
    // opens synchronously within the click and the browser does not block it.
    preloadGoogleSignIn();
  }, []);

  const totalRecords = contents.reduce((sum, r) => sum + r.count, 0);

  const handleExport = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const backup = await buildBackup();
      downloadBackup(backup);
      setMessage(
        `Exported ${summarise(backup).reduce((s, r) => s + r.count, 0)} records. Keep the file somewhere it will survive this computer.`
      );
    } catch (err) {
      setError(`Export failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async (file: File) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const backup = parseBackup(await file.text());

      const incoming = summarise(backup);
      const total = incoming.reduce((s, r) => s + r.count, 0);
      const warning = replace
        ? `Replace everything in this browser with the ${total} records in this file?\n\nAnything here that is not in the file will be deleted.`
        : `Merge ${total} records from this file into this browser?\n\nRecords with the same id will be overwritten; everything else is kept.`;
      if (!confirm(warning)) {
        setBusy(false);
        return;
      }

      const result = await restoreBackup(backup, { replace });
      const restoredTotal = result.restored.reduce((s, r) => s + r.count, 0);
      setMessage(
        `Restored ${restoredTotal} records${result.settingsRestored ? ' plus your boats and settings' : ''}. Reloading…`
      );
      // Boat fleet, home port and thresholds are read once at startup, so reload to apply them.
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      setError(`Import failed: ${(err as Error).message}`);
      setBusy(false);
    }
  };

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={() => navigate('/planner/more')}
          className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h2 className="text-xl font-semibold">Backup &amp; Restore</h2>
      </div>

      <div className="mb-5 flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
        <p className="text-xs leading-relaxed text-amber-200">
          Everything you plan is stored only in this browser on this device. There is no server
          copy. Another browser, another computer, or clearing your site data all start from empty.
          Export a file to move a trip somewhere else — and to have a backup at all.
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}
      {message && (
        <p className="mb-4 flex items-start gap-2 rounded border border-green-500/40 bg-green-500/10 px-3 py-2 text-sm text-green-300">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          {message}
        </p>
      )}

      {/* ── What is in this browser ── */}
      <section className="mb-5 rounded-lg border border-slate-800 bg-slate-900 p-3">
        <div className="mb-2 flex items-center gap-2">
          <Database className="h-4 w-4 text-sea-400" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            In this browser
          </h3>
        </div>
        {contents.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nothing saved yet in this browser. If you were expecting your trips here, they are in
            the browser you created them in — export a file there and import it here.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
            {contents.map(({ table, count }) => (
              <div key={table} className="flex justify-between text-sm">
                <span className="text-slate-400">{TABLE_LABELS[table]}</span>
                <span className="font-medium text-slate-200">{count}</span>
              </div>
            ))}
          </div>
        )}

        {persisted !== null && (
          <p className="mt-3 border-t border-slate-800 pt-2 text-xs text-slate-500">
            {persisted
              ? 'Storage is marked durable — this browser has agreed not to evict your data to reclaim space.'
              : 'Storage is best-effort: this browser may clear your data if it runs low on space. Exporting a file is the only guaranteed backup.'}
          </p>
        )}
      </section>

      {/* ── Export ── */}
      <section className="mb-5 rounded-lg border border-slate-800 bg-slate-900 p-4">
        <h3 className="mb-1 font-medium text-slate-100">Export all data</h3>
        <p className="mb-3 text-xs text-slate-500">
          Saves one .json file with every trip, route, boat, crew member, checklist, float plan,
          place and logbook entry, plus your settings. Weather and tide caches are left out — they
          refresh on their own.
        </p>
        <button
          onClick={handleExport}
          disabled={busy || totalRecords === 0}
          title={totalRecords === 0 ? 'Nothing to export yet' : 'Download a backup file'}
          className="flex items-center gap-2 rounded-lg bg-sea-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-sea-700 disabled:opacity-40"
        >
          <Download className="h-4 w-4" />
          Export All Data
        </button>
        <p className="mt-2 text-xs text-slate-600">
          The file contains crew details and your Windy API key — treat it as private.
        </p>
      </section>

      {/* ── Google Drive ── */}
      <section className="mb-5 rounded-lg border border-slate-800 bg-slate-900 p-4">
        <div className="mb-1 flex items-center gap-2">
          <Cloud className="h-4 w-4 text-sea-400" />
          <h3 className="font-medium text-slate-100">Google Drive</h3>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Uploads the same backup file to a <strong>Cruising Planner Backups</strong> folder the app
          creates in your Drive. Access is limited to files this app makes — it can never see the
          rest of your Drive.
        </p>

        {driveError && (
          <p className="mb-3 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {driveError}
          </p>
        )}
        {driveMessage && !driveError && (
          <p className="mb-3 rounded border border-green-500/40 bg-green-500/10 px-3 py-2 text-xs text-green-300">
            {driveMessage}
          </p>
        )}

        <label className="mb-1 block text-xs font-medium text-slate-400">Google OAuth Client ID</label>
        <div className="mb-1 flex gap-2">
          <input
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            onBlur={() => setApiKey('googleClientId', clientId.trim())}
            placeholder="1234567890-abc123.apps.googleusercontent.com"
            className="flex-1 rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 outline-none focus:ring-1 focus:ring-sea-500"
          />
        </div>
        <p className="mb-3 text-xs text-slate-600">
          Created once in Google Cloud Console. Not a secret — it identifies the app, it does not
          grant access on its own.
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={connectDrive}
            disabled={driveBusy || !clientId.trim()}
            className="flex items-center gap-2 rounded-lg bg-sea-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sea-700 disabled:opacity-40"
          >
            <Cloud className="h-4 w-4" />
            {connected ? 'Reconnect' : 'Connect Google Drive'}
          </button>
          <button
            onClick={backupNow}
            disabled={driveBusy || !clientId.trim()}
            className="flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-40"
          >
            <CloudUpload className="h-4 w-4" />
            Back Up Now
          </button>
          {connected && (
            <>
              <button
                onClick={refreshDrive}
                disabled={driveBusy}
                className="flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 disabled:opacity-40"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
              <button
                onClick={disconnectDrive}
                className="flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-slate-300 hover:bg-red-900/40 hover:text-red-300"
              >
                <LogOut className="h-4 w-4" />
                Disconnect
              </button>
            </>
          )}
        </div>

        <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={driveAutoBackup}
            onChange={(e) => setDriveAutoBackup(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-700 text-sea-500 focus:ring-sea-500"
          />
          <span>
            Back up automatically when I open the planner
            <span className="block text-xs text-slate-500">
              At most once an hour, and only while your Google sign-in is still valid. If it has
              lapsed it stays quiet rather than interrupting you — come back here and press Connect.
              Nothing can run while the planner is closed.
            </span>
          </span>
        </label>

        {lastBackupAt() > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            Last Drive backup {new Date(lastBackupAt()).toLocaleString()}
          </p>
        )}

        {driveFiles.length > 0 && (
          <div className="mt-4 border-t border-slate-800 pt-3">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Backups in Drive ({driveFiles.length})
            </h4>
            <div className="space-y-1">
              {driveFiles.slice(0, 10).map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between gap-2 rounded border border-slate-800 bg-slate-950 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-slate-200">{f.name}</div>
                    <div className="text-xs text-slate-500">
                      {new Date(f.createdTime).toLocaleString()}
                      {f.size ? ` · ${Math.round(Number(f.size) / 1024)} KB` : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => restoreFromDrive(f)}
                    disabled={driveBusy}
                    className="shrink-0 rounded bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-40"
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── Import ── */}
      <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <h3 className="mb-1 font-medium text-slate-100">Import a backup</h3>
        <p className="mb-3 text-xs text-slate-500">
          Load a file exported from any browser. You will be asked to confirm before anything is
          written.
        </p>

        <label className="mb-3 flex cursor-pointer items-start gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={replace}
            onChange={(e) => setReplace(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-700 text-sea-500 focus:ring-sea-500"
          />
          <span>
            Replace everything instead of merging
            <span className="block text-xs text-slate-500">
              Off (recommended): adds the file's records and overwrites matching ones, keeping
              anything else already here. On: wipes each section first so this browser ends up
              matching the file exactly.
            </span>
          </span>
        </label>

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className="flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-40"
        >
          <Upload className="h-4 w-4" />
          Choose Backup File
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImport(file);
            e.target.value = '';
          }}
        />
      </section>
    </div>
  );
}
