import { supabase } from '@infrastructure/supabase/supabaseClient';
import { routeRepository } from '@infrastructure/repositories/RouteRepositoryImpl';
import { routeToSupabase, supabaseToRoute } from '@infrastructure/mappers/RouteMapper';
import { gpsPointToSupabase, supabaseToGpsPoint } from '@infrastructure/mappers/GpsPointMapper';
import { waypointToSupabase, supabaseToWaypoint } from '@infrastructure/mappers/WaypointMapper';
import { uploadWaypointMedia } from './MediaUploadService';
import { NK_TABLES, NK_BUCKET, NK_MEDIA_BUCKET } from '@infrastructure/supabase/tables';
import { uuidv4 } from '@shared/utils/uuid';
import { Route } from '@core/entities/Route';
import { WaypointMedia } from '@core/entities/Waypoint';

export interface SyncResult {
  synced: number;
  failed: number;
  errors: string[];
}

/**
 * Empuja UNA ruta completa a Supabase: route → GPS points → waypoints (con
 * imágenes). NO marca is_synced (eso lo decide quien llama). Lanza si algo
 * falla, para que el caller cuente el fallo / muestre el error.
 *
 * Es idempotente: las imágenes ya subidas (URLs http) no se re-suben, y las
 * filas de imágenes se borran+reinsertan para no acumular duplicados.
 */
async function pushRoute(route: Route, userId: string): Promise<void> {
  // 1. Upsert ruta
  const { error: routeErr } = await supabase
    .from(NK_TABLES.routes)
    .upsert(routeToSupabase(route), { onConflict: 'id' });
  if (routeErr) throw new Error(`Route: ${routeErr.message}`);

  // 2. GPS points — DELETE-all remoto + reinsert para RECONCILIAR ediciones del
  //    trazado. Un upsert es append-only: si el editor quitó puntos (recortar/
  //    suavizar/quitar tramo), los viejos sobrevivirían en la nube y resucitarían
  //    al re-bajar en otro dispositivo. Se evita `NOT IN (...ids)` (200+ uuids
  //    revientan el largo de URL de PostgREST). Ventana sub-segundo con 0 puntos
  //    remotos: es un backup personal, aceptable sin RPC transaccional.
  const gpsPoints = await routeRepository.getGpsPoints(route.id);
  const { error: gpsDelErr } = await supabase
    .from(NK_TABLES.gpsPoints)
    .delete()
    .eq('route_id', route.id);
  if (gpsDelErr) throw new Error(`GPS points (limpieza): ${gpsDelErr.message}`);
  const BATCH = 500;
  for (let i = 0; i < gpsPoints.length; i += BATCH) {
    const batch = gpsPoints.slice(i, i + BATCH).map(gpsPointToSupabase);
    const { error: gpsErr } = await supabase
      .from(NK_TABLES.gpsPoints)
      .upsert(batch, { onConflict: 'id' });
    if (gpsErr) throw new Error(`GPS points: ${gpsErr.message}`);
  }

  // 3. Waypoints + media (fotos, videos, notas de voz)
  const waypoints = await routeRepository.getWaypoints(route.id);
  for (const wp of waypoints) {
    // Subir solo media local (la que ya es http se devuelve igual).
    const remoteMedia = await uploadWaypointMedia(wp.media, userId, wp.id);

    // Persistir las URLs remotas en SQLite → un re-sync no las re-sube.
    // Persistir si cambió algo: URLs remotas nuevas O media podada (un archivo
    // local ausente se descarta en uploadWaypointMedia → la lista queda más
    // corta; sin el chequeo de longitud no se guardaría y se reintentaría siempre).
    const changed =
      remoteMedia.length !== wp.media.length ||
      remoteMedia.some(
        (m, i) => m.uri !== wp.media[i]?.uri || m.thumbnailUri !== wp.media[i]?.thumbnailUri,
      );
    if (changed) {
      await routeRepository.updateWaypointMedia(wp.id, remoteMedia);
    }

    const wpSupabase = waypointToSupabase(wp);
    const { error: wpErr } = await supabase
      .from(NK_TABLES.waypoints)
      .upsert(wpSupabase, { onConflict: 'id' });
    if (wpErr) throw new Error(`Waypoint: ${wpErr.message}`);

    // Idempotente: borrar filas previas (media nueva + imágenes legacy) y
    // reinsertar el set actual en nk_waypoint_media.
    await supabase.from(NK_TABLES.waypointMedia).delete().eq('waypoint_id', wp.id);
    await supabase.from(NK_TABLES.waypointImages).delete().eq('waypoint_id', wp.id);
    if (remoteMedia.length > 0) {
      const rows = remoteMedia.map((m) => ({
        id: uuidv4(),
        waypoint_id: wp.id,
        type: m.type,
        storage_path: m.uri,
        thumbnail_path: m.thumbnailUri ?? null,
        duration_ms: m.durationMs ?? null,
        created_at: new Date().toISOString(),
      }));
      const { error: mErr } = await supabase.from(NK_TABLES.waypointMedia).insert(rows);
      if (mErr) throw new Error(`Waypoint media: ${mErr.message}`);
    }
  }

  // 4. Reconciliar waypoints borrados: eliminar en remoto los que ya no existen
  //    localmente (con limpieza de su Storage). El upsert de arriba solo cubre
  //    los que quedan; sin esto, un waypoint borrado resucitaría al re-bajar.
  const localWpIds = new Set(waypoints.map((w) => w.id));
  const { data: remoteWps } = await supabase
    .from(NK_TABLES.waypoints)
    .select('id')
    .eq('route_id', route.id);
  for (const rw of remoteWps ?? []) {
    if (!localWpIds.has(rw.id as string)) await deleteRemoteWaypoint(rw.id as string);
  }
}

/**
 * Sincroniza todas las rutas offline (is_synced = 0) del usuario con Supabase.
 * Estrategia: upsert atómico por ruta → GPS points → waypoints (con imágenes).
 */
export async function syncOfflineRoutes(userId: string): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, failed: 0, errors: [] };

  const unsynced = await routeRepository.getUnsyncedRoutes(userId);
  if (unsynced.length === 0) return result;

  for (const route of unsynced) {
    try {
      await pushRoute(route, userId);
      await routeRepository.markAsSynced(route.id);
      result.synced++;
    } catch (err) {
      result.failed++;
      result.errors.push(
        `Ruta "${route.name}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return result;
}

/**
 * Fuerza la subida de UNA ruta concreta, esté o no marcada como sincronizada.
 * Útil para re-subir waypoints/imágenes de una ruta que ya se había
 * sincronizado a nivel de ruta pero cuyas fotos no llegaron a la nube.
 */
export async function syncRouteById(routeId: string, userId: string): Promise<void> {
  const route = await routeRepository.getById(routeId);
  if (!route) throw new Error('Ruta no encontrada');
  await pushRoute(route, userId);
  await routeRepository.markAsSynced(route.id);
}

export interface PullResult {
  pulled: number;
  deleted: number;
}

/**
 * Descarga las rutas del usuario desde Supabase a SQLite (A6 — sync de
 * lectura, multi-dispositivo / reinstalación).
 *
 * Política de conflicto (sin merge a nivel de campo):
 *  - No toca un BORRADOR local (grabación en curso).
 *  - No pisa una ruta local pendiente de subir (is_synced = 0): el push manda.
 *  - El resto: la versión remota es la autoritativa (INSERT OR REPLACE).
 */
export async function pullRemoteRoutes(userId: string): Promise<PullResult> {
  const result: PullResult = { pulled: 0, deleted: 0 };

  const { data: routes, error } = await supabase
    .from(NK_TABLES.routes)
    .select('*')
    .eq('user_id', userId);
  if (error) throw new Error(`Pull rutas: ${error.message}`);

  // Propagación de borrado: una ruta local SINCRONIZADA que ya no existe en
  // remoto fue borrada en otro dispositivo → eliminarla aquí también.
  // (Las no sincronizadas / borradores nunca se tocan.)
  const remoteIds = new Set((routes ?? []).map((r) => r.id as string));
  const localRoutes = await routeRepository.getAll(userId);
  for (const lr of localRoutes) {
    if (lr.isSynced && !remoteIds.has(lr.id)) {
      await routeRepository.delete(lr.id);
      result.deleted++;
    }
  }

  if (!routes || routes.length === 0) return result;

  for (const rr of routes) {
    const local = await routeRepository.getById(rr.id as string);
    if (local && (local.isDraft || !local.isSynced)) continue; // no clobbear

    const route = supabaseToRoute(rr);

    const { data: gp, error: gpErr } = await supabase
      .from(NK_TABLES.gpsPoints)
      .select('*')
      .eq('route_id', route.id)
      .order('sequence_index', { ascending: true });
    if (gpErr) throw new Error(`Pull GPS: ${gpErr.message}`);

    const { data: wp, error: wpErr } = await supabase
      .from(NK_TABLES.waypoints)
      .select('*')
      .eq('route_id', route.id);
    if (wpErr) throw new Error(`Pull waypoints: ${wpErr.message}`);

    const gpsPoints = (gp ?? []).map(supabaseToGpsPoint);
    const waypoints = await Promise.all(
      (wp ?? []).map(async (w) => {
        const media: WaypointMedia[] = [];
        // Media nueva (foto/video/audio).
        const { data: mediaRows } = await supabase
          .from(NK_TABLES.waypointMedia)
          .select('type, storage_path, thumbnail_path, duration_ms')
          .eq('waypoint_id', w.id);
        for (const m of mediaRows ?? []) {
          media.push({
            type: (m.type as WaypointMedia['type']) ?? 'image',
            uri: m.storage_path as string,
            thumbnailUri: (m.thumbnail_path as string | null) ?? undefined,
            durationMs: (m.duration_ms as number | null) ?? undefined,
          });
        }
        // Legacy: imágenes en nk_waypoint_images (rutas antiguas).
        const { data: imgs } = await supabase
          .from(NK_TABLES.waypointImages)
          .select('storage_path')
          .eq('waypoint_id', w.id);
        const seen = new Set(media.map((m) => m.uri));
        for (const img of imgs ?? []) {
          const uri = img.storage_path as string;
          if (!seen.has(uri)) media.push({ type: 'image', uri });
        }
        return supabaseToWaypoint(w, media);
      })
    );

    await routeRepository.save(route, gpsPoints, waypoints);
    result.pulled++;
  }

  return result;
}

/** Borra una ruta en Supabase (CASCADE elimina gps/waypoints/images). */
export async function deleteRemoteRoute(routeId: string): Promise<void> {
  // 1. Limpiar objetos de Storage ANTES del CASCADE (luego no podríamos
  //    obtener los storage_path). El CASCADE de Postgres no borra Storage.
  try {
    const { data: wps } = await supabase
      .from(NK_TABLES.waypoints)
      .select('id')
      .eq('route_id', routeId);
    const wpIds = (wps ?? []).map((w) => w.id as string);
    if (wpIds.length > 0) {
      // Legacy: bucket de imágenes.
      const { data: imgs } = await supabase
        .from(NK_TABLES.waypointImages)
        .select('storage_path')
        .in('waypoint_id', wpIds);
      const imgKeys = (imgs ?? [])
        .map((i) => String(i.storage_path).split(`/${NK_BUCKET}/`)[1])
        .filter((k): k is string => !!k);
      if (imgKeys.length > 0) await supabase.storage.from(NK_BUCKET).remove(imgKeys);

      // Media nueva (bucket de media): incluye archivo + miniatura.
      const { data: mediaRows } = await supabase
        .from(NK_TABLES.waypointMedia)
        .select('storage_path, thumbnail_path')
        .in('waypoint_id', wpIds);
      const mediaKeys = (mediaRows ?? [])
        .flatMap((m) => [m.storage_path, m.thumbnail_path])
        .filter((p): p is string => !!p)
        .map((p) => String(p).split(`/${NK_MEDIA_BUCKET}/`)[1])
        .filter((k): k is string => !!k);
      if (mediaKeys.length > 0) await supabase.storage.from(NK_MEDIA_BUCKET).remove(mediaKeys);
    }
  } catch (e) {
    console.warn('[sync] no se pudieron limpiar imágenes de Storage', e);
  }

  // 2. Borrar la ruta (CASCADE elimina gps/waypoints/images en Postgres).
  const { error } = await supabase.from(NK_TABLES.routes).delete().eq('id', routeId);
  if (error) throw new Error(`Borrado remoto: ${error.message}`);
}

/**
 * Borra UN waypoint en Supabase, limpiando antes su media de Storage (el CASCADE
 * de Postgres elimina las filas hijas pero NO los objetos de Storage). Molde de
 * `deleteRemoteRoute`, acotado a un solo waypoint.
 */
export async function deleteRemoteWaypoint(waypointId: string): Promise<void> {
  try {
    // Legacy: imágenes en nk_waypoint_images.
    const { data: imgs } = await supabase
      .from(NK_TABLES.waypointImages)
      .select('storage_path')
      .eq('waypoint_id', waypointId);
    const imgKeys = (imgs ?? [])
      .map((i) => String(i.storage_path).split(`/${NK_BUCKET}/`)[1])
      .filter((k): k is string => !!k);
    if (imgKeys.length > 0) await supabase.storage.from(NK_BUCKET).remove(imgKeys);

    // Media nueva (archivo + miniatura) en nk_waypoint_media.
    const { data: mediaRows } = await supabase
      .from(NK_TABLES.waypointMedia)
      .select('storage_path, thumbnail_path')
      .eq('waypoint_id', waypointId);
    const mediaKeys = (mediaRows ?? [])
      .flatMap((m) => [m.storage_path, m.thumbnail_path])
      .filter((p): p is string => !!p)
      .map((p) => String(p).split(`/${NK_MEDIA_BUCKET}/`)[1])
      .filter((k): k is string => !!k);
    if (mediaKeys.length > 0) await supabase.storage.from(NK_MEDIA_BUCKET).remove(mediaKeys);
  } catch (e) {
    console.warn('[sync] no se pudieron limpiar archivos de Storage del waypoint', e);
  }

  const { error } = await supabase.from(NK_TABLES.waypoints).delete().eq('id', waypointId);
  if (error) throw new Error(`Borrado remoto de waypoint: ${error.message}`);
}
