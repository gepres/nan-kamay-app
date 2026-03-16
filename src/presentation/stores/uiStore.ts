import { create } from 'zustand';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface UiState {
  toasts: Toast[];
  isOffline: boolean;
  showToast: (message: string, type?: Toast['type']) => void;
  dismissToast: (id: string) => void;
  setOffline: (offline: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  toasts: [],
  isOffline: false,

  showToast: (message, type = 'info') => {
    const id = crypto.randomUUID();
    set((state) => ({
      toasts: [...state.toasts, { id, message, type }],
    }));
    // Auto-dismiss después de 4 segundos
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, 4000);
  },

  dismissToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },

  setOffline: (isOffline) => set({ isOffline }),
}));
