import { supabase } from '@infrastructure/supabase/supabaseClient';
import { routeRepository } from '@infrastructure/repositories/RouteRepositoryImpl';
import { routeToSupabase, supabaseToRoute } from '@infrastructure/mappers/RouteMapper';
import { gpsPointToSupabase, supabaseToGpsPoint } from '@infrastructure/mappers/GpsPointMapper';
import { waypointToSupabase, supabaseToWaypoint } from '@infrastructure/mappers/WaypointMapper';
import { uploadWaypointImages } from './ImageUploadService';
import { NK_TABLES, NK_BUCKET } from '@infrastructure/supabase/tables';
import { uuidv4 } from '@shared/utils/uuid';

export interface SyncResult {
  synced: number;
  failed: number;
  errors: string[];
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
      // 1. Upsert ruta
      const { error: routeErr } = await supabase
        .from(NK_TABLES.routes)
        .upsert(routeToSupabase(route), { onConflict: 'id' });
      if (routeErr) throw new Error(`Route: ${routeErr.message}`);

      // 2. GPS points (en lotes de 500 para no superar el límite de Supabase)
      const gpsPoints = await routeRepository.getGpsPoints(route.id);
      const BATCH = 500;
      for (let i = 0; i < gpsPoints.length; i += BATCH) {
        const batch = gpsPoints.slice(i, i + BATCH).map(gpsPointToSupabase);
        const { error: gpsErr } = await supabase
          .from(NK_TABLES.gpsPoints)
          .upsert(batch, { onConflict: 'id' });
        if (gpsErr) throw new Error(`GPS points: ${gpsErr.message}`);
      }

      // 3. Waypoints + imágenes
      const waypoints = await routeRepository.getWaypoints(route.id);
      for (const wp of waypoints) {
        // Subir solo imágenes locales (las que ya son http se devuelven igual).
        const remoteUris = await uploadWaypointImages(wp.imageUris, userId, wp.id);

        // A8: persistir las URLs remotas en SQLite → un re-sync ya no
        // las vuelve a subir (uploadWaypointImages las salta por ser http).
        if (remoteUris.some((u, i) => u !== wp.imageUris[i])) {
          await routeRepository.updateWaypointImageUris(wp.id, remoteUris);
        }

        const wpSupabase = waypointToSupabase(wp);
        const { error: wpErr } = await supabase
          .from(NK_TABLES.waypoints)
          .upsert(wpSupabase, { onConflict: 'id' });
        if (wpErr) throw new Error(`Waypoint: ${wpErr.message}`);

        // A8: idempotente — borrar las filas previas de este waypoint y
        // reinsertar el set actual (evita acumular duplicados en reintentos).
        await supabase.from(NK_TABLES.waypointImages).delete().eq('waypoint_id', wp.id);
        if (remoteUris.length > 0) {
          const images = remoteUris.map((url) => ({
            id: uuidv4(),
            waypoint_id: wp.id,
            storage_path: url,
            created_at: new Date().toISOString(),
          }));
          const { error: imgErr } = await supabase
            .from(NK_TABLES.waypointImages)
            .insert(images);
          if (imgErr) throw new Error(`Waypoint images: ${imgErr.message}`);
        }
      }

      // 4. Marcar como sincronizada en SQLite
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
        const { data: imgs } = await supabase
          .from(NK_TABLES.waypointImages)
          .select('storage_path')
          .eq('waypoint_id', w.id);
        const uris = (imgs ?? []).map((i) => i.storage_path as string);
        return supabaseToWaypoint(w, uris);
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
      const { data: imgs } = await supabase
        .from(NK_TABLES.waypointImages)
        .select('storage_path')
        .in('waypoint_id', wpIds);
      const keys = (imgs ?? [])
        .map((i) => String(i.storage_path).split(`/${NK_BUCKET}/`)[1])
        .filter((k): k is string => !!k);
      if (keys.length > 0) {
        await supabase.storage.from(NK_BUCKET).remove(keys);
      }
    }
  } catch (e) {
    console.warn('[sync] no se pudieron limpiar imágenes de Storage', e);
  }

  // 2. Borrar la ruta (CASCADE elimina gps/waypoints/images en Postgres).
  const { error } = await supabase.from(NK_TABLES.routes).delete().eq('id', routeId);
  if (error) throw new Error(`Borrado remoto: ${error.message}`);
}
