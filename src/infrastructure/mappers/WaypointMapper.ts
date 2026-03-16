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
    image_uris: JSON.stringify(p.imageUris),
    created_at: p.createdAt.toISOString(),
  };
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
    created_at: p.createdAt.toISOString(),
  };
}
