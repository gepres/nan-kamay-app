import { create } from 'zustand';
import { Route } from '@core/entities/Route';
import { getRoutesUseCase } from '@application/routes/GetRoutesUseCase';
import { deleteRouteUseCase } from '@application/routes/DeleteRouteUseCase';
import { syncOfflineRoutesUseCase } from '@application/routes/SyncOfflineRoutesUseCase';
import { pullRemoteRoutesUseCase } from '@application/routes/PullRemoteRoutesUseCase';

interface RoutesState {
  routes: Route[];
  isLoading: boolean;
  isSyncing: boolean;
  lastSyncedAt: Date | null;

  fetchRoutes: (userId: string) => Promise<void>;
  deleteRoute: (routeId: string) => Promise<void>;
  syncRoutes: (userId: string) => Promise<{ synced: number; failed: number; errors: string[] }>;
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
    // Evita corridas concurrentes (en dev los effects pueden dispararse 2×):
    // dos pull simultáneos abren transacciones SQLite solapadas →
    // "cannot start a transaction within a transaction".
    if (get().isSyncing) return { synced: 0, failed: 0, errors: [] };
    set({ isSyncing: true });
    try {
      // 1. Push: subir rutas locales no sincronizadas.
      const result = await syncOfflineRoutesUseCase(userId);
      // 2. Pull: descargar rutas remotas (multi-dispositivo / reinstalación).
      //    Best-effort: un fallo de pull no invalida el push.
      try {
        await pullRemoteRoutesUseCase(userId);
      } catch (e) {
        console.error('[sync] pull falló', e);
      }
      // 3. Refrescar la lista en memoria desde SQLite.
      await get().fetchRoutes(userId);
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
