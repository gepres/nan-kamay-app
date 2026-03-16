import { create } from 'zustand';
import { Route } from '@core/entities/Route';
import { getRoutesUseCase } from '@application/routes/GetRoutesUseCase';
import { deleteRouteUseCase } from '@application/routes/DeleteRouteUseCase';
import { syncOfflineRoutesUseCase } from '@application/routes/SyncOfflineRoutesUseCase';

interface RoutesState {
  routes: Route[];
  isLoading: boolean;
  isSyncing: boolean;
  lastSyncedAt: Date | null;

  fetchRoutes: (userId: string) => Promise<void>;
  deleteRoute: (routeId: string) => Promise<void>;
  syncRoutes: (userId: string) => Promise<{ synced: number; failed: number }>;
  addRoute: (route: Route) => void;
}

export const useRoutesStore = create<RoutesState>((set, get) => ({
  routes: [],
  isLoading: false,
  isSyncing: false,
  lastSyncedAt: null,

  fetchRoutes: async (userId) => {
    set({ isLoading: true });
    try {
      const routes = await getRoutesUseCase(userId);
      set({ routes });
    } finally {
      set({ isLoading: false });
    }
  },

  deleteRoute: async (routeId) => {
    await deleteRouteUseCase(routeId);
    set((state) => ({
      routes: state.routes.filter((r) => r.id !== routeId),
    }));
  },

  syncRoutes: async (userId) => {
    set({ isSyncing: true });
    try {
      const result = await syncOfflineRoutesUseCase(userId);
      if (result.synced > 0) {
        // Re-fetch para actualizar el estado isSynced en memoria
        await get().fetchRoutes(userId);
      }
      set({ lastSyncedAt: new Date() });
      return result;
    } finally {
      set({ isSyncing: false });
    }
  },

  addRoute: (route) => {
    set((state) => ({ routes: [route, ...state.routes] }));
  },
}));
