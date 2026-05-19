import { Waypoint } from '@core/entities/Waypoint';

export function rowToWaypoint(row: Record<string, unknown>): Waypoint {
  let imageUris: string[] = [];
  try {
    imageUris = JSON.parse(row.image_uris as string);
  } catch {
    imageUris = [];
  }

  return Waypoint.fromProps({
    id: row.id as string,
    routeId: row.route_id as string,
    latitude: row.latitude as number,
    longitude: row.longitude as number,
    altitude: (row.altitude as number | null) ?? null,
    title: row.title as string,
    description: (row.description as string | null) ?? undefined,
    type: (row.type as string | null) ?? undefined,
    imageUris,
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
    image_uris: JSON.stringify(p.imageUris),
    created_at: p.createdAt.toISOString(),
  };
}

/** Fila de Supabase (nk_waypoints) + URLs de imágenes → Entidad Waypoint */
export function supabaseToWaypoint(
  row: Record<string, unknown>,
  imageUris: string[],
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
    imageUris,
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
