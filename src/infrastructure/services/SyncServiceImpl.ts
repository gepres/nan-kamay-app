import { supabase } from '@infrastructure/supabase/supabaseClient';
import { routeRepository } from '@infrastructure/repositories/RouteRepositoryImpl';
import { routeToSupabase } from '@infrastructure/mappers/RouteMapper';
import { gpsPointToSupabase } from '@infrastructure/mappers/GpsPointMapper';
import { waypointToSupabase } from '@infrastructure/mappers/WaypointMapper';
import { uploadWaypointImages } from './ImageUploadService';

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
        .from('routes')
        .upsert(routeToSupabase(route), { onConflict: 'id' });
      if (routeErr) throw new Error(`Route: ${routeErr.message}`);

      // 2. GPS points (en lotes de 500 para no superar el límite de Supabase)
      const gpsPoints = await routeRepository.getGpsPoints(route.id);
      const BATCH = 500;
      for (let i = 0; i < gpsPoints.length; i += BATCH) {
        const batch = gpsPoints.slice(i, i + BATCH).map(gpsPointToSupabase);
        const { error: gpsErr } = await supabase
          .from('gps_points')
          .upsert(batch, { onConflict: 'id' });
        if (gpsErr) throw new Error(`GPS points: ${gpsErr.message}`);
      }

      // 3. Waypoints + imágenes
      const waypoints = await routeRepository.getWaypoints(route.id);
      for (const wp of waypoints) {
        // Subir imágenes locales → Supabase Storage
        const remoteUris = await uploadWaypointImages(wp.imageUris, userId, wp.id);

        const wpSupabase = waypointToSupabase(wp);
        const { error: wpErr } = await supabase
          .from('waypoints')
          .upsert(wpSupabase, { onConflict: 'id' });
        if (wpErr) throw new Error(`Waypoint: ${wpErr.message}`);

        // Upsert de las imágenes en la tabla waypoint_images
        if (remoteUris.length > 0) {
          const images = remoteUris.map((url) => ({
            id: crypto.randomUUID(),
            waypoint_id: wp.id,
            storage_path: url,
            created_at: new Date().toISOString(),
          }));
          const { error: imgErr } = await supabase
            .from('waypoint_images')
            .upsert(images, { onConflict: 'id' });
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
