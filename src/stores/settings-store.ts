import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuid } from 'uuid';
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
  /** OAuth client ID for Google Drive backup. Public by design — not a secret. */
  googleClientId?: string;
}

/** A blank boat to start from when adding a second vessel to the fleet. */
function emptyBoat(name: string): BoatConfig {
  return {
    ...BENETEAU_OCEANIS_37,
    id: uuid(),
    name,
    make: '',
    model: '',
    registrationNumber: undefined,
    hailingPort: undefined,
    mmsi: undefined,
    callSign: undefined,
  };
}

interface SettingsState {
  /** Every boat the user has saved. Always contains at least one entry. */
  boats: BoatConfig[];
  /** Id of the boat currently in use. */
  activeBoatId: string;
  /**
   * The active boat. Kept as its own field (rather than derived) so every existing
   * consumer keeps reading it synchronously and unchanged. All mutations below keep
   * this in step with `boats`.
   */
  boatConfig: BoatConfig;
  homePort: HomePort;
  weatherThresholds: WeatherThresholds;
  apiKeys: ApiKeys;
  theme: 'dark' | 'light';
  units: 'imperial' | 'metric';
  /** Back up to Google Drive automatically when the planner is opened. */
  driveAutoBackup: boolean;
  setDriveAutoBackup: (on: boolean) => void;
  /** Updates the active boat in place. */
  setBoatConfig: (config: BoatConfig) => void;
  /** Adds a boat to the fleet and makes it active. Returns its id. */
  addBoat: (name?: string) => string;
  /** Copies an existing boat (handy for a sistership). Returns the new id. */
  duplicateBoat: (id: string) => string;
  /** Switches which boat the whole app plans around. */
  selectBoat: (id: string) => void;
  /** Removes a boat. Refuses to remove the last one. */
  deleteBoat: (id: string) => void;
  setHomePort: (homePort: HomePort) => void;
  setWeatherThresholds: (thresholds: WeatherThresholds) => void;
  setApiKey: (service: keyof ApiKeys, key: string | undefined) => void;
  setTheme: (theme: 'dark' | 'light') => void;
  setUnits: (units: 'imperial' | 'metric') => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      boats: [BENETEAU_OCEANIS_37],
      activeBoatId: BENETEAU_OCEANIS_37.id,
      boatConfig: BENETEAU_OCEANIS_37,
      homePort: DEFAULT_HOME_PORT,
      weatherThresholds: DEFAULT_THRESHOLDS,
      apiKeys: {},
      theme: 'dark',
      units: 'imperial',
      driveAutoBackup: false,
      setDriveAutoBackup: (on) => set({ driveAutoBackup: on }),

      setBoatConfig: (config) =>
        set((state) => ({
          boatConfig: config,
          activeBoatId: config.id,
          boats: state.boats.some((b) => b.id === config.id)
            ? state.boats.map((b) => (b.id === config.id ? config : b))
            : [...state.boats, config],
        })),

      addBoat: (name) => {
        const boat = emptyBoat(name?.trim() || `Boat ${get().boats.length + 1}`);
        set((state) => ({
          boats: [...state.boats, boat],
          activeBoatId: boat.id,
          boatConfig: boat,
        }));
        return boat.id;
      },

      duplicateBoat: (id) => {
        const source = get().boats.find((b) => b.id === id) ?? get().boatConfig;
        const copy: BoatConfig = { ...source, id: uuid(), name: `${source.name} (copy)` };
        set((state) => ({
          boats: [...state.boats, copy],
          activeBoatId: copy.id,
          boatConfig: copy,
        }));
        return copy.id;
      },

      selectBoat: (id) => {
        const boat = get().boats.find((b) => b.id === id);
        if (!boat) return;
        set({ activeBoatId: id, boatConfig: boat });
      },

      deleteBoat: (id) =>
        set((state) => {
          // Never leave the app without a boat to plan around.
          if (state.boats.length <= 1) return state;
          const remaining = state.boats.filter((b) => b.id !== id);
          const active =
            state.activeBoatId === id ? remaining[0] : (remaining.find((b) => b.id === state.activeBoatId) ?? remaining[0]);
          return { boats: remaining, activeBoatId: active.id, boatConfig: active };
        }),

      setHomePort: (homePort) => set({ homePort }),
      setWeatherThresholds: (thresholds) => set({ weatherThresholds: thresholds }),
      setApiKey: (service, key) =>
        set((state) => ({
          apiKeys: { ...state.apiKeys, [service]: key || undefined },
        })),
      setTheme: (theme) => set({ theme }),
      setUnits: (units) => set({ units }),
    }),
    {
      name: 'cruising-planner-settings',
      version: 1,
      /**
       * v0 stored a single `boatConfig` and no fleet. Seed the fleet from whatever boat
       * the user already had so their vessel details carry over untouched.
       */
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<SettingsState>;
        if (version >= 1 && state.boats?.length) return state as SettingsState;

        const current = state.boatConfig ?? BENETEAU_OCEANIS_37;
        return {
          ...state,
          boats: [current],
          activeBoatId: current.id,
          boatConfig: current,
        } as SettingsState;
      },
    }
  )
);
