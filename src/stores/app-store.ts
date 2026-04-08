import { create } from 'zustand';

interface AppState {
  isOnline: boolean;
  activeTripId: string | null;
  sidebarOpen: boolean;
  setOnline: (online: boolean) => void;
  setActiveTripId: (id: string | null) => void;
  toggleSidebar: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  activeTripId: null,
  sidebarOpen: false,
  setOnline: (online) => set({ isOnline: online }),
  setActiveTripId: (id) => set({ activeTripId: id }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}));
