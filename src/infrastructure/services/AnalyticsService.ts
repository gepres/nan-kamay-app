import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@infrastructure/supabase/supabaseClient';
import { NK_TABLES } from '@infrastructure/supabase/tables';
import { useAuthStore } from '@presentation/stores/authStore';
import { useUiStore } from '@presentation/stores/uiStore';
import { uuidv4 } from '@shared/utils/uuid';

/**
 * Analítica de uso IN-HOUSE (sin terceros) → tabla `nk_events` en Supabase.
 *
 * Privacidad (app de ubicación): NUNCA loguear coordenadas/GPS ni PII. El llamador
 * pasa solo props primitivas NO sensibles; `sanitizeProps` descarta objetos. La
 * pantalla se loguea como patrón de segmento (`routes/[id]`, no el id real).
 *
 * Offline-first: la cola se persiste en AsyncStorage y se vacía al reconectar /
 * volver a foreground / por timer. Respeta el opt-out. Sin login no trackea (la
 * RLS de `nk_events` exige `user_id = auth.uid()`).
 */

const BUFFER_KEY = 'nk:analytics-buffer';
const OPTOUT_KEY = 'nk:analytics-opt-out';
const MAX_BUFFER = 500;
const FLUSH_AT = 20;
const FLUSH_MS = 30000;
const BATCH = 100;

interface QueuedEvent {
  id: string;
  user_id: string;
  session_id: string;
  name: string;
  props: Record<string, unknown> | null;
  screen: string | null;
  app_version: string | null;
  platform: string;
  created_at: string;
}

const SESSION_ID = uuidv4();                        // una "sesión" = un arranque del app
const APP_VERSION = Constants.expoConfig?.version ?? null;

let queue: QueuedEvent[] = [];
let optOut = false;
let currentScreen: string | null = null;
let initialized = false;
let flushing = false;

async function persist(): Promise<void> {
  try { await AsyncStorage.setItem(BUFFER_KEY, JSON.stringify(queue)); } catch { /* noop */ }
}

/** Solo primitivos (string/number/boolean); descarta el resto para no filtrar objetos/PII. */
function sanitizeProps(props?: Record<string, unknown>): Record<string, unknown> | null {
  if (!props) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

/** Marca la pantalla actual (patrón de segmento). La usan screen_view y demás eventos. */
export function setCurrentScreen(screen: string | null): void {
  currentScreen = screen;
}

/** Registra un evento. No-op si hay opt-out o no hay sesión. Nunca pases GPS/PII en props. */
export function trackEvent(name: string, props?: Record<string, unknown>): void {
  if (optOut) return;
  const user = useAuthStore.getState().user;
  if (!user) return;
  queue.push({
    id: uuidv4(),
    user_id: user.id,
    session_id: SESSION_ID,
    name,
    props: sanitizeProps(props),
    screen: currentScreen,
    app_version: APP_VERSION,
    platform: Platform.OS,
    created_at: new Date().toISOString(),
  });
  if (queue.length > MAX_BUFFER) queue = queue.slice(queue.length - MAX_BUFFER); // descarta los más viejos
  persist();
  if (queue.length >= FLUSH_AT) flush();
}

/** Envía un lote a Supabase si hay red + sesión. Conserva la cola si falla. */
export async function flush(): Promise<void> {
  if (flushing || optOut) return;
  if (useUiStore.getState().isOffline) return;
  const user = useAuthStore.getState().user;
  if (!user) return;
  // Descarta eventos de otro usuario (no se pueden insertar bajo RLS) para no
  // envenenar la cola tras un cambio de sesión.
  const mine = queue.filter((e) => e.user_id === user.id);
  if (mine.length !== queue.length) { queue = mine; await persist(); }
  if (queue.length === 0) return;

  flushing = true;
  try {
    const batch = queue.slice(0, BATCH);
    const { error } = await supabase.from(NK_TABLES.events).insert(batch);
    if (!error) {
      queue = queue.slice(batch.length);
      await persist();
    }
  } catch {
    /* sin red / error transitorio → reintenta en el próximo gatillo */
  } finally {
    flushing = false;
  }
}

export async function getOptOut(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(OPTOUT_KEY)) === '1'; } catch { return false; }
}

export async function setOptOut(value: boolean): Promise<void> {
  optOut = value;
  try { await AsyncStorage.setItem(OPTOUT_KEY, value ? '1' : '0'); } catch { /* noop */ }
  if (value) { queue = []; await persist(); }       // al desactivar, no dejamos nada pendiente
}

/** Inicializa la cola persistida, el opt-out y los gatillos de flush. Idempotente. */
export async function initAnalytics(): Promise<void> {
  if (initialized) return;
  initialized = true;
  optOut = await getOptOut();
  try {
    const raw = await AsyncStorage.getItem(BUFFER_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) queue = parsed;
  } catch { /* noop */ }
  NetInfo.addEventListener((s) => { if (s.isConnected) flush(); });
  AppState.addEventListener('change', (st) => { if (st === 'active') flush(); });
  setInterval(() => { flush(); }, FLUSH_MS);
  flush();                                            // vaciar lo que quedó de un arranque anterior
}
