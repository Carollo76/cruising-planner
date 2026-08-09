/**
 * Google Drive backup.
 *
 * Browser-only OAuth via Google Identity Services. There is no backend, so there is no
 * refresh token: access tokens last about an hour and live in memory only. Once consent
 * has been granted, a token can usually be re-obtained silently (no popup) while the
 * user still has a Google session, which is what makes unattended backup on load work.
 *
 * Scope is drive.file — the narrowest scope that does the job. The app can only ever see
 * and touch files it created itself, never the rest of the user's Drive.
 */

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_NAME = 'Cruising Planner Backups';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

/* ── Minimal typings for the Google Identity Services global ── */
interface TokenResponse {
  access_token?: string;
  error?: string;
  expires_in?: number;
}
interface TokenClient {
  requestAccessToken: (overrides?: { prompt?: string }) => void;
}
interface GoogleAccounts {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        callback: (resp: TokenResponse) => void;
        error_callback?: (err: { type?: string }) => void;
      }) => TokenClient;
      revoke: (token: string, done?: () => void) => void;
    };
  };
}
declare global {
  interface Window {
    google?: GoogleAccounts;
  }
}

let gisPromise: Promise<void> | null = null;

/**
 * Loads Google's script ahead of time.
 *
 * Critical for the popup to survive: browsers only allow a popup that opens during the
 * synchronous run of a user gesture. Awaiting the script download inside the click
 * handler pushes requestAccessToken() past that window, so Chrome silently blocks the
 * window and GIS reports it back as `popup_closed`. Calling this on mount means the
 * click handler can reach requestAccessToken() with no await in front of it.
 */
export function preloadGoogleSignIn(): void {
  void loadGis().catch(() => undefined);
}

/** True once the Google script is ready and a popup can be opened synchronously. */
export function isGisReady(): boolean {
  return !!window.google?.accounts?.oauth2;
}

function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisPromise) return gisPromise;

  gisPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('could not load Google sign-in')));
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error('could not load Google sign-in — check your connection or an ad blocker'));
    document.head.appendChild(script);
  });
  return gisPromise;
}

/* ── Token handling ── */

let accessToken: string | null = null;
let tokenExpiresAt = 0;

export function hasLiveToken(): boolean {
  return !!accessToken && Date.now() < tokenExpiresAt - 60_000;
}

export function forgetToken(): void {
  accessToken = null;
  tokenExpiresAt = 0;
}

/**
 * Obtains an access token.
 *
 * `interactive: false` asks Google to return one without any UI, which only succeeds if
 * the user has already consented and still has a Google session — that path is used for
 * automatic backups and must never pop a window unexpectedly.
 */
export function getAccessToken(
  clientId: string,
  { interactive }: { interactive: boolean }
): Promise<string> {
  if (hasLiveToken()) return Promise.resolve(accessToken!);
  if (!clientId) return Promise.reject(new Error('no Google client ID configured'));

  // Deliberately not `async`: when the script is already loaded this runs start to finish
  // inside the click, which is the only way the browser will allow the popup.
  if (!isGisReady()) {
    return loadGis().then(() => requestToken(clientId, interactive));
  }
  return requestToken(clientId, interactive);
}

function requestToken(clientId: string, interactive: boolean): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(describeAuthError(resp.error)));
          return;
        }
        accessToken = resp.access_token;
        tokenExpiresAt = Date.now() + (resp.expires_in ?? 3600) * 1000;
        resolve(accessToken);
      },
      error_callback: (err) => reject(new Error(describeAuthError(err.type))),
    });

    // An empty prompt means "no UI unless you have to"; silent mode relies on it.
    client.requestAccessToken({ prompt: interactive ? 'consent' : '' });
  });
}

/** Turns Google's terse error codes into something actionable. */
function describeAuthError(code?: string): string {
  switch (code) {
    case 'popup_closed':
    case 'popup_failed_to_open':
      return 'the Google sign-in window did not stay open — allow pop-ups for this site (the icon at the right of the address bar), then press Connect again';
    case 'access_denied':
      return 'Google refused access — add your own Gmail under Google Auth Platform → Audience → Test users, then try again';
    case 'idpiframe_initialization_failed':
      return 'Google rejected this site — check the Authorised JavaScript origin is exactly https://www.sailwelladjusted.us';
    case undefined:
    case '':
      return 'Google sign-in was dismissed';
    default:
      return `Google sign-in failed: ${code}`;
  }
}

export function revokeAccess(): void {
  if (accessToken && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(accessToken);
  }
  forgetToken();
}

/* ── Drive REST helpers ── */

async function driveFetch(token: string, url: string, init?: RequestInit): Promise<Response> {
  const resp = await fetch(url, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
  });
  if (resp.status === 401) {
    forgetToken();
    throw new Error('Google access expired — reconnect and try again');
  }
  if (!resp.ok) {
    let detail = `${resp.status} ${resp.statusText}`;
    try {
      const body = (await resp.json()) as { error?: { message?: string } };
      if (body?.error?.message) detail = body.error.message;
    } catch {
      // keep the status line
    }
    throw new Error(detail);
  }
  return resp;
}

/**
 * Finds, or creates, the app's backup folder.
 *
 * Under drive.file a listing only returns files this app created, so this can never
 * collide with an unrelated folder of the same name elsewhere in the user's Drive.
 */
export async function ensureBackupFolder(token: string): Promise<string> {
  const query = encodeURIComponent(
    `name='${FOLDER_NAME}' and mimeType='${FOLDER_MIME}' and trashed=false`
  );
  const found = await driveFetch(
    token,
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&pageSize=1`
  );
  const list = (await found.json()) as { files?: Array<{ id: string }> };
  if (list.files?.length) return list.files[0].id;

  const created = await driveFetch(token, 'https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME }),
  });
  const folder = (await created.json()) as { id: string };
  return folder.id;
}

export interface DriveBackupFile {
  id: string;
  name: string;
  createdTime: string;
  size?: string;
}

export async function listBackups(token: string, folderId: string): Promise<DriveBackupFile[]> {
  const query = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const resp = await driveFetch(
    token,
    `https://www.googleapis.com/drive/v3/files?q=${query}` +
      `&orderBy=createdTime desc&pageSize=50&fields=files(id,name,createdTime,size)`
  );
  const body = (await resp.json()) as { files?: DriveBackupFile[] };
  return body.files ?? [];
}

/** Uploads a backup as a new dated file, so previous ones are kept as history. */
export async function uploadBackup(
  token: string,
  folderId: string,
  contents: string,
  filename: string
): Promise<DriveBackupFile> {
  const boundary = 'cruising-planner-boundary';
  const metadata = { name: filename, parents: [folderId], mimeType: 'application/json' };
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
    `${contents}\r\n` +
    `--${boundary}--`;

  const resp = await driveFetch(
    token,
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,createdTime,size',
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    }
  );
  return (await resp.json()) as DriveBackupFile;
}

export async function downloadBackupFile(token: string, fileId: string): Promise<string> {
  const resp = await driveFetch(
    token,
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
  );
  return resp.text();
}
