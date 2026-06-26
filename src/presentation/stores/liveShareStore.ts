import { create } from 'zustand';

/**
 * Estado del "Compartir en vivo" (PR2 — seguimiento en vivo).
 *
 * Vive aparte del trackingStore para no mezclar concerns: el toggle puede estar
 * activo durante una grabación y se apaga al finalizar (lo cierra useTracking
 * en el efecto de stop) o al desactivarlo a mano (active.tsx).
 */
export interface LiveShareSession {
  id: string;
  token: string;
}

interface LiveShareState {
  active: boolean;
  session: LiveShareSession | null;
  setSession: (session: LiveShareSession) => void;
  clear: () => void;
}

export const useLiveShareStore = create<LiveShareState>((set) => ({
  active: false,
  session: null,
  setSession: (session) => set({ active: true, session }),
  clear: () => set({ active: false, session: null }),
}));
