import { useState, useEffect, useCallback } from 'react';
import {
  Wind,
  ThermometerSun,
  MapPin,
  ChevronDown,
  Home,
  Locate,
  Anchor,
  RefreshCw,
} from 'lucide-react';
import { useSettingsStore } from '../../../stores/settings-store';
import { db } from '../../../db/database';
import type { Destination } from '../../../types/destination';

interface Forecast {
  name: string;
  temperature: number;
  windSpeed: string;
  windDirection: string;
  shortForecast: string;
  detailedForecast: string;
  isDaytime: boolean;
}

interface WeatherLocation {
  name: string;
  lat: number;
  lng: number;
}

export function WeatherDashboard() {
  const homePort = useSettingsStore((s) => s.homePort);
  const [location, setLocation] = useState<WeatherLocation>({
    name: homePort.name,
    lat: homePort.lat,
    lng: homePort.lng,
  });
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    db.destinations.toArray().then(setDestinations);
  }, []);

  const fetchWeather = useCallback(async (loc: WeatherLocation) => {
    setLoading(true);
    setError(null);
    try {
      const pointRes = await fetch(
        `https://api.weather.gov/points/${loc.lat.toFixed(4)},${loc.lng.toFixed(4)}`,
        { headers: { 'User-Agent': 'CruisingPlanner/1.0' } }
      );
      if (!pointRes.ok) throw new Error('Failed to get point metadata');
      const pointData = await pointRes.json();

      const forecastRes = await fetch(pointData.properties.forecast, {
        headers: { 'User-Agent': 'CruisingPlanner/1.0' },
      });
      if (!forecastRes.ok) throw new Error('Failed to get forecast');
      const forecastData = await forecastRes.json();

      setForecasts(
        forecastData.properties.periods.slice(0, 8).map((p: any) => ({
          name: p.name,
          temperature: p.temperature,
          windSpeed: p.windSpeed,
          windDirection: p.windDirection,
          shortForecast: p.shortForecast,
          detailedForecast: p.detailedForecast,
          isDaytime: p.isDaytime,
        }))
      );
    } catch (err: any) {
      setError(err.message);
      setForecasts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWeather(location);
  }, [location, fetchWeather]);

  const useHomePort = () => {
    setLocation({ name: homePort.name, lat: homePort.lat, lng: homePort.lng });
    setPickerOpen(false);
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation not supported');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          name: 'Current Location',
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setLocating(false);
        setPickerOpen(false);
      },
      (err) => {
        alert(`Could not get location: ${err.message}`);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const pickDestination = (d: Destination) => {
    setLocation({ name: d.name, lat: d.position.lat, lng: d.position.lng });
    setPickerOpen(false);
  };

  return (
    <div className="p-4">
      {/* Header with location picker */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Marine Weather</h2>
        <button
          onClick={() => fetchWeather(location)}
          disabled={loading}
          className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-50"
          aria-label="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Location selector */}
      <div className="relative mb-4">
        <button
          onClick={() => setPickerOpen(!pickerOpen)}
          className="flex w-full items-center justify-between rounded-lg border border-slate-800 bg-slate-900 px-3 py-2.5 text-left transition-colors hover:border-slate-700"
        >
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-sea-400" />
            <div>
              <div className="text-sm font-medium text-slate-100">{location.name}</div>
              <div className="font-mono text-xs text-slate-500">
                {location.lat.toFixed(4)}°, {location.lng.toFixed(4)}°
              </div>
            </div>
          </div>
          <ChevronDown
            className={`h-4 w-4 text-slate-400 transition-transform ${pickerOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {pickerOpen && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-96 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
            <div className="border-b border-slate-800 p-1">
              <button
                onClick={useHomePort}
                className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-slate-800"
              >
                <Home className="h-4 w-4 text-sea-400" />
                <div>
                  <div className="text-slate-100">Home Port</div>
                  <div className="text-xs text-slate-500">{homePort.name}</div>
                </div>
              </button>
              <button
                onClick={useCurrentLocation}
                disabled={locating}
                className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-slate-800 disabled:opacity-50"
              >
                <Locate className={`h-4 w-4 text-sea-400 ${locating ? 'animate-pulse' : ''}`} />
                <div>
                  <div className="text-slate-100">
                    {locating ? 'Locating…' : 'Current Location (GPS)'}
                  </div>
                </div>
              </button>
            </div>
            {destinations.length > 0 && (
              <div className="p-1">
                <div className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Destinations
                </div>
                {destinations.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => pickDestination(d)}
                    className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-slate-800"
                  >
                    <Anchor className="h-4 w-4 text-slate-500" />
                    <div>
                      <div className="text-slate-100">{d.name}</div>
                      <div className="text-xs capitalize text-slate-500">
                        {d.type.replace('-', ' ')}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Loading / Error / Forecast */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-sea-400 border-t-transparent" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4 text-amber-400">
          <p className="font-medium">Weather Unavailable</p>
          <p className="mt-1 text-sm">{error}</p>
          <p className="mt-2 text-xs text-amber-500">
            Weather data requires an internet connection. NOAA Weather API only covers US locations.
          </p>
        </div>
      ) : forecasts.length === 0 ? (
        <div className="text-center text-sm text-slate-500">No forecast data available</div>
      ) : (
        <div className="space-y-3">
          {forecasts.map((f) => (
            <div
              key={f.name}
              className={`rounded-lg border p-4 ${
                f.isDaytime
                  ? 'border-slate-800 bg-slate-900'
                  : 'border-slate-800 bg-slate-900/60'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-slate-100">{f.name}</h3>
                  <p className="mt-1 text-sm text-slate-300">{f.shortForecast}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1 text-2xl font-semibold text-sea-400">
                  <ThermometerSun className="h-5 w-5" />
                  {f.temperature}°F
                </div>
              </div>
              <div className="mt-3 flex items-center gap-4 text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <Wind className="h-3.5 w-3.5" />
                  {f.windDirection} {f.windSpeed}
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">{f.detailedForecast}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
