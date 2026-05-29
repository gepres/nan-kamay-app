import { Waypoint, WaypointMedia } from '@core/entities/Waypoint';

/** Parsea la columna `media` (JSON); si no existe, deriva de `image_uris` (legacy). */
function parseMedia(row: Record<string, unknown>): WaypointMedia[] {
  const raw = row.media as string | null | undefined;
  if (raw) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr as WaypointMedia[];
    } catch {
      /* JSON corrupto: caer a legacy */
    }
  }
  // Legacy: filas antiguas solo tienen image_uris (array de strings).
  try {
    const uris = JSON.parse((row.image_uris as string) ?? '[]');
    if (Array.isArray(uris)) {
      return uris.map((uri: string) => ({ type: 'image' as const, uri }));
    }
  } catch {
    /* ignore */
  }
  return [];
}

export function rowToWaypoint(row: Record<string, unknown>): Waypoint {
  return Waypoint.fromProps({
    id: row.id as string,
    routeId: row.route_id as string,
    latitude: row.latitude as number,
    longitude: row.longitude as number,
    altitude: (row.altitude as number | null) ?? null,
    title: row.title as string,
    description: (row.description as string | null) ?? undefined,
    type: (row.type as string | null) ?? undefined,
    media: parseMedia(row),
    createdAt: new Date(row.created_at as string),
  });
}

export function waypointToRow(wp: Waypoint): Record<string, unknown> {
  const p = wp.toProps();
  return {
    id: p.id,
    route_id: p.routeId,
    latitude: p.latitude,
    longitude: p.longitude,
    altitude: p.altitude ?? null,
    title: p.title,
    description: p.description ?? null,
    type: p.type ?? null,
    // Fuente de verdad: media JSON. Mantenemos image_uris (solo imágenes) por
    // compatibilidad con builds/migraciones antiguas que aún lo lean.
    media: JSON.stringify(p.media),
    image_uris: JSON.stringify(wp.imageUris),
    created_at: p.createdAt.toISOString(),
  };
}

/** Fila de Supabase (nk_waypoints) + media → Entidad Waypoint */
export function supabaseToWaypoint(
  row: Record<string, unknown>,
  media: WaypointMedia[],
): Waypoint {
  return Waypoint.fromProps({
    id: row.id as string,
    routeId: row.route_id as string,
    latitude: row.latitude as number,
    longitude: row.longitude as number,
    altitude: (row.altitude as number | null) ?? null,
    title: row.title as string,
    description: (row.description as string | null) ?? undefined,
    type: (row.type as string | null) ?? undefined,
    media,
    createdAt: new Date(row.created_at as string),
  });
}

export function waypointToSupabase(wp: Waypoint): Record<string, unknown> {
  const p = wp.toProps();
  return {
    id: p.id,
    route_id: p.routeId,
    latitude: p.latitude,
    longitude: p.longitude,
    altitude: p.altitude ?? null,
    title: p.title,
    description: p.description ?? null,
    type: p.type ?? null,
    created_at: p.createdAt.toISOString(),
  };
}
