import { useState } from 'react';
import { Key, Eye, EyeOff, ExternalLink, Check } from 'lucide-react';
import { useSettingsStore } from '../../../stores/settings-store';

export function ApiKeysEditor() {
  const { apiKeys, setApiKey } = useSettingsStore();
  const [windyKey, setWindyKey] = useState(apiKeys.windy ?? '');
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  const saveKey = () => {
    setApiKey('windy', windyKey.trim() || undefined);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const isDirty = windyKey !== (apiKeys.windy ?? '');

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Key className="h-5 w-5 text-sea-400" />
        <h3 className="font-semibold text-slate-100">Weather API Keys</h3>
      </div>
      <p className="mb-3 text-xs text-slate-400">
        Stored locally in your browser. Never leaves your device.
      </p>

      <div className="space-y-3">
        <div>
          <label className="mb-1 flex items-center justify-between text-xs font-medium text-slate-400">
            <span>Windy Point Forecast API Key</span>
            <a
              href="https://api.windy.com/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sea-400 hover:underline"
            >
              Get a key
              <ExternalLink className="h-3 w-3" />
            </a>
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showKey ? 'text' : 'password'}
                value={windyKey}
                onChange={(e) => setWindyKey(e.target.value)}
                placeholder="Paste your Windy API key..."
                className="w-full rounded bg-slate-800 px-3 py-2 pr-9 font-mono text-sm text-slate-100 placeholder-slate-500 outline-none focus:ring-1 focus:ring-sea-500"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                aria-label={showKey ? 'Hide' : 'Show'}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <button
              type="button"
              onClick={saveKey}
              disabled={!isDirty && !saved}
              className="flex items-center gap-1.5 rounded-lg bg-sea-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-sea-700 disabled:opacity-40"
            >
              {saved ? <Check className="h-4 w-4" /> : 'Save'}
            </button>
          </div>
          {apiKeys.windy && !isDirty && (
            <p className="mt-1 text-xs text-green-400">
              <Check className="mr-1 inline h-3 w-3" />
              Configured · used for Go/No-Go assessments
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
