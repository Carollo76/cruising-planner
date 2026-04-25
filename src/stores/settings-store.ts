import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BoatConfig } from '../types/boat';
import { BENETEAU_OCEANIS_37 } from '../constants/boat-defaults';
import type { WeatherThresholds } from '../constants/weather-thresholds';
import { DEFAULT_THRESHOLDS } from '../constants/weather-thresholds';

export interface HomePort {
  name: string;
  lat: number;
  lng: number;
  zoom: number;
}

/** Centerport Yacht Club, Northport Harbor, NY — home base */
export const DEFAULT_HOME_PORT: HomePort = {
  name: 'Centerport Yacht Club',
  lat: 40.9015,
  lng: -73.3592,
  zoom: 13,
};

export interface ApiKeys {
  windy?: string;
}

interface SettingsState {
  boatConfig: BoatConfig;
  homePort: HomePort;
  weatherThresholds: WeatherThresholds;
  apiKeys: ApiKeys;
  theme: 'dark' | 'light';
  units: 'imperial' | 'metric';
  setBoatConfig: (config: BoatConfig) => void;
  setHomePort: (homePort: HomePort) => void;
  setWeatherThresholds: (thresholds: WeatherThresholds) => void;
  setApiKey: (service: keyof ApiKeys, key: string | undefined) => void;
  setTheme: (theme: 'dark' | 'light') => void;
  setUnits: (units: 'imperial' | 'metric') => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      boatConfig: BENETEAU_OCEANIS_37,
      homePort: DEFAULT_HOME_PORT,
      weatherThresholds: DEFAULT_THRESHOLDS,
      apiKeys: {},
      theme: 'dark',
      units: 'imperial',
      setBoatConfig: (config) => set({ boatConfig: config }),
      setHomePort: (homePort) => set({ homePort }),
      setWeatherThresholds: (thresholds) => set({ weatherThresholds: thresholds }),
      setApiKey: (service, key) =>
        set((state) => ({
          apiKeys: { ...state.apiKeys, [service]: key || undefined },
        })),
      setTheme: (theme) => set({ theme }),
      setUnits: (units) => set({ units }),
    }),
    { name: 'cruising-planner-settings' }
  )
);
