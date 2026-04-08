import { useState } from 'react';
import { MapPin, Locate, Save } from 'lucide-react';
import { useSettingsStore, DEFAULT_HOME_PORT } from '../../../stores/settings-store';

export function HomePortEditor() {
  const { homePort, setHomePort } = useSettingsStore();
  const [name, setName] = useState(homePort.name);
  const [lat, setLat] = useState(homePort.lat.toString());
  const [lng, setLng] = useState(homePort.lng.toString());
  const [zoom, setZoom] = useState(homePort.zoom.toString());
  const [locating, setLocating] = useState(false);
  const [saved, setSaved] = useState(false);

  const isDirty =
    name !== homePort.name ||
    parseFloat(lat) !== homePort.lat ||
    parseFloat(lng) !== homePort.lng ||
    parseInt(zoom, 10) !== homePort.zoom;

  const save = () => {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    const zoomNum = parseInt(zoom, 10);
    if (isNaN(latNum) || isNaN(lngNum) || isNaN(zoomNum)) return;
    setHomePort({ name: name.trim() || 'Home', lat: latNum, lng: lngNum, zoom: zoomNum });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation not supported by this browser');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(5));
        setLng(pos.coords.longitude.toFixed(5));
        setLocating(false);
      },
      (err) => {
        alert(`Could not get location: ${err.message}`);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const resetToDefault = () => {
    setName(DEFAULT_HOME_PORT.name);
    setLat(DEFAULT_HOME_PORT.lat.toString());
    setLng(DEFAULT_HOME_PORT.lng.toString());
    setZoom(DEFAULT_HOME_PORT.zoom.toString());
  };

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="mb-3 flex items-center gap-2">
        <MapPin className="h-5 w-5 text-sea-400" />
        <h3 className="font-semibold text-slate-100">Home Port</h3>
      </div>
      <p className="mb-3 text-xs text-slate-400">
        Your default location — the chart will center here when the app opens.
      </p>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">Port Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Centerport, NY"
            className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Latitude</label>
            <input
              type="number"
              step="0.00001"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              className="w-full rounded bg-slate-800 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Longitude</label>
            <input
              type="number"
              step="0.00001"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              className="w-full rounded bg-slate-800 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">
            Default Zoom (3–18)
          </label>
          <input
            type="number"
            min={3}
            max={18}
            value={zoom}
            onChange={(e) => setZoom(e.target.value)}
            className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-sea-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={save}
            disabled={!isDirty}
            className="flex items-center gap-1.5 rounded-lg bg-sea-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-sea-700 disabled:opacity-40"
          >
            <Save className="h-4 w-4" />
            {saved ? 'Saved!' : 'Save'}
          </button>
          <button
            type="button"
            onClick={useMyLocation}
            disabled={locating}
            className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-40"
          >
            <Locate className={`h-4 w-4 ${locating ? 'animate-pulse' : ''}`} />
            {locating ? 'Locating...' : 'Use My Location'}
          </button>
          <button
            type="button"
            onClick={resetToDefault}
            className="text-xs text-slate-500 hover:text-slate-300"
          >
            Reset
          </button>
        </div>
      </div>
    </section>
  );
}
