import { supabase } from '@infrastructure/supabase/supabaseClient';
import { NK_TABLES } from '@infrastructure/supabase/tables';
import { uuidv4 } from '@shared/utils/uuid';
import type { Coordinates } from '@core/value-objects/Coordinates';

/**
 * Seguimiento en vivo (PR2). El emisor (dueño, autenticado) crea una sesión y
 * sube su última posición a Supabase; un contacto la lee con el token vía la
 * función `nk_get_live_session` (SECURITY DEFINER). Ver `supabase/schema.sql`.
 *
 * Nota de seguridad: el token usa `uuidv4()` (Math.random) — suficiente para una
 * capacidad efímera (12 h, sin enumeración posible porque el único camino de
 * lectura es la RPC con token exacto). Endurecer con un CSPRNG (expo-crypto) es
 * una mejora futura (añadiría un módulo nativo, hoy PR2 es JS-only).
 */

/** Horas de vida de una sesión antes de que la RPC deje de devolverla. */
const SESSION_TTL_HOURS = 12;

/**
 * Extrae el token de un enlace pegado (`nan-kamay://seguir/TOKEN`) o devuelve la
 * entrada ya limpia. Tolera espacios, query (`?`) y fragmento (`#`).
 */
export function extractFollowToken(input: string): string {
  const s = (input || '').trim();
  const i = s.toLowerCase().lastIndexOf('seguir/');
  const tok = i >= 0 ? s.slice(i + 'seguir/'.length) : s;
  return tok.split(/[?#\s]/)[0].trim();
}

const FOLLOW_TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Valida que el token sea un UUID v4. Evita inyección de rutas al navegar
 * (`router.push('/seguir/' + token)` con `../`) y acota la longitud antes de la
 * llamada de red. Úsalo SIEMPRE antes de navegar o consultar con un token.
 */
export function isValidFollowToken(token: string): boolean {
  return FOLLOW_TOKEN_RE.test(token);
}

export interface LiveShareHandle {
  id: string;
  token: string;
}

export interface LiveSnapshot {
  ownerName: string | null;
  status: 'active' | 'ended';
  lat: number | null;
  lon: number | null;
  altitude: number | null;
  accuracy: number | null;
  speed: number | null;
  lastAt: Date | null;
  distanceMeters: number;
  startedAt: Date | null;
  endedAt: Date | null;
}

/** Crea una sesión de seguimiento en vivo. Devuelve id + token a compartir. */
export async function startLiveShare(input: {
  userId: string;
  routeId: string | null;
  ownerName: string;
  distanceMeters?: number;
}): Promise<LiveShareHandle> {
  const id = uuidv4();
  const token = uuidv4();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_HOURS * 3600 * 1000);
  // Limpieza oportunista: borra las sesiones PROPIAS ya vencidas (privacidad; la
  // tabla no crece sin límite por usuario). Best-effort: no aborta el compartir.
  try {
    await supabase.from(NK_TABLES.liveSessions)
      .delete()
      .eq('user_id', input.userId)
      .lt('expires_at', now.toISOString());
  } catch { /* best-effort */ }
  const { error } = await supabase.from(NK_TABLES.liveSessions).insert({
    id,
    user_id: input.userId,
    token,
    route_id: input.routeId,
    owner_name: input.ownerName,
    status: 'active',
    distance_meters: input.distanceMeters ?? 0,
    started_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  });
  if (error) throw new Error(`No se pudo iniciar el vivo: ${error.message}`);
  return { id, token };
}

/** Actualiza la última posición de la sesión (in-place). */
export async function pushLivePosition(input: {
  sessionId: string;
  coords: Coordinates;
  speed?: number | null;
  accuracy?: number | null;
  distanceMeters?: number;
}): Promise<void> {
  const { error } = await supabase
    .from(NK_TABLES.liveSessions)
    .update({
      last_lat: input.coords.latitude,
      last_lon: input.coords.longitude,
      last_altitude: input.coords.altitude ?? null,
      last_accuracy: input.accuracy ?? null,
      last_speed: input.speed ?? null,
      last_at: new Date().toISOString(),
      distance_meters: input.distanceMeters ?? 0,
    })
    .eq('id', input.sessionId);
  if (error) throw new Error(error.message);
}

/** Marca la sesión como finalizada (el visor verá "finalizó"). */
export async function endLiveShare(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from(NK_TABLES.liveSessions)
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('id', sessionId);
  if (error) throw new Error(error.message);
}

/** Lee la posición en vivo por su token (vía RPC SECURITY DEFINER). null si no existe/expiró. */
export async function fetchLiveSession(token: string): Promise<LiveSnapshot | null> {
  const { data, error } = await supabase.rpc('nk_get_live_session', { p_token: token });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    ownerName: row.owner_name ?? null,
    status: row.status === 'ended' ? 'ended' : 'active',
    lat: row.last_lat ?? null,
    lon: row.last_lon ?? null,
    altitude: row.last_altitude ?? null,
    accuracy: row.last_accuracy ?? null,
    speed: row.last_speed ?? null,
    lastAt: row.last_at ? new Date(row.last_at) : null,
    distanceMeters: row.distance_meters ?? 0,
    startedAt: row.started_at ? new Date(row.started_at) : null,
    endedAt: row.ended_at ? new Date(row.ended_at) : null,
  };
}
