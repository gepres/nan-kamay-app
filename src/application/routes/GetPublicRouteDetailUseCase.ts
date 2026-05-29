import { supabase } from '@infrastructure/supabase/supabaseClient';
import { NK_TABLES } from '@infrastructure/supabase/tables';
import { supabaseToRoute } from '@infrastructure/mappers/RouteMapper';
import { supabaseToGpsPoint } from '@infrastructure/mappers/GpsPointMapper';
import { supabaseToWaypoint } from '@infrastructure/mappers/WaypointMapper';
import { Route } from '@core/entities/Route';
import { GpsPoint } from '@core/entities/GpsPoint';
import { Waypoint, WaypointMedia } from '@core/entities/Waypoint';

export interface PublicRouteDetail {
  route: Route;
  gpsPoints: GpsPoint[];
  waypoints: Waypoint[];
}

/**
 * Trae el detalle COMPLETO (ruta + gps + waypoints + imágenes) de una ruta
 * pública desde Supabase, sin tocar SQLite local. RLS permite el SELECT de
 * rutas/gps/waypoints cuando `is_public = true` (ver supabase/schema.sql).
 *
 * Devuelve null si la ruta no existe o ya no es pública.
 */
export async function getPublicRouteDetailUseCase(
  routeId: string,
): Promise<PublicRouteDetail | null> {
  const { data: routeRow, error: rErr } = await supabase
    .from(NK_TABLES.routes)
    .select('*')
    .eq('id', routeId)
    .eq('is_public', true)
    .maybeSingle();
  if (rErr) throw new Error(rErr.message);
  if (!routeRow) return null;

  const [gpsRes, wpRes] = await Promise.all([
    supabase
      .from(NK_TABLES.gpsPoints)
      .select('*')
      .eq('route_id', routeId)
      .order('sequence_index', { ascending: true }),
    supabase.from(NK_TABLES.waypoints).select('*').eq('route_id', routeId),
  ]);
  if (gpsRes.error) throw new Error(gpsRes.error.message);
  if (wpRes.error) throw new Error(wpRes.error.message);

  const waypoints = await Promise.all(
    (wpRes.data ?? []).map(async (w) => {
      const media: WaypointMedia[] = [];
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
    }),
  );

  return {
    route: supabaseToRoute(routeRow),
    gpsPoints: (gpsRes.data ?? []).map(supabaseToGpsPoint),
    waypoints,
  };
}
