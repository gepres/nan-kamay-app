import { Route, RouteProps } from '@core/entities/Route';
import { Difficulty } from '@core/value-objects/Difficulty';

/** Fila de SQLite → Entidad Route */
export function rowToRoute(row: Record<string, unknown>): Route {
  return Route.fromProps({
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? undefined,
    activityType: (row.activity_type as string | null) ?? undefined,
    difficulty: (row.difficulty as Difficulty) ?? 'easy',
    distanceMeters: row.distance_meters as number,
    durationSeconds: row.duration_seconds as number,
    elevationGainMeters: row.elevation_gain_meters as number,
    elevationLossMeters: row.elevation_loss_meters as number,
    maxElevationMeters: row.max_elevation_meters as number,
    minElevationMeters: (row.min_elevation_meters as number) ?? 0,
    avgSpeedKmh: row.avg_speed_kmh as number,
    maxSpeedKmh: row.max_speed_kmh as number,
    startedAt: new Date(row.started_at as string),
    finishedAt: row.finished_at ? new Date(row.finished_at as string) : undefined,
    isPublic: row.is_public === 1,
    isSynced: row.is_synced === 1,
    isDraft: row.is_draft === 1,
    parentRouteId: (row.parent_route_id as string | null) ?? undefined,
    createdAt: new Date(row.created_at as string),
  });
}

/** Entidad Route → objeto para insertar en SQLite */
export function routeToRow(route: Route): Record<string, unknown> {
  const p = route.toProps();
  return {
    id: p.id,
    user_id: p.userId,
    name: p.name,
    description: p.description ?? null,
    activity_type: p.activityType ?? null,
    difficulty: p.difficulty,
    distance_meters: p.distanceMeters,
    duration_seconds: p.durationSeconds,
    elevation_gain_meters: p.elevationGainMeters,
    elevation_loss_meters: p.elevationLossMeters,
    max_elevation_meters: p.maxElevationMeters,
    min_elevation_meters: p.minElevationMeters ?? 0,
    avg_speed_kmh: p.avgSpeedKmh,
    max_speed_kmh: p.maxSpeedKmh,
    started_at: p.startedAt.toISOString(),
    finished_at: p.finishedAt?.toISOString() ?? null,
    is_public: p.isPublic ? 1 : 0,
    is_synced: p.isSynced ? 1 : 0,
    is_draft: p.isDraft ? 1 : 0,
    parent_route_id: p.parentRouteId ?? null,
    created_at: p.createdAt.toISOString(),
  };
}

/** Fila de Supabase (nk_routes) → Entidad Route (marcada sincronizada) */
export function supabaseToRoute(row: Record<string, unknown>): Route {
  return Route.fromProps({
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? undefined,
    activityType: (row.activity_type as string | null) ?? undefined,
    difficulty: (row.difficulty as Difficulty) ?? 'easy',
    distanceMeters: (row.distance_meters as number) ?? 0,
    durationSeconds: (row.duration_seconds as number) ?? 0,
    elevationGainMeters: (row.elevation_gain_meters as number) ?? 0,
    elevationLossMeters: (row.elevation_loss_meters as number) ?? 0,
    maxElevationMeters: (row.max_elevation_meters as number) ?? 0,
    minElevationMeters: (row.min_elevation_meters as number) ?? 0,
    avgSpeedKmh: (row.avg_speed_kmh as number) ?? 0,
    maxSpeedKmh: (row.max_speed_kmh as number) ?? 0,
    startedAt: new Date(row.started_at as string),
    finishedAt: row.finished_at ? new Date(row.finished_at as string) : undefined,
    isPublic: row.is_public === true,
    isSynced: true,
    isDraft: false,
    parentRouteId: (row.parent_route_id as string | null) ?? undefined,
    createdAt: new Date(row.created_at as string),
  });
}

/** Entidad Route → shape de Supabase (snake_case, booleanos nativos) */
export function routeToSupabase(route: Route): Record<string, unknown> {
  const p = route.toProps();
  return {
    id: p.id,
    user_id: p.userId,
    name: p.name,
    description: p.description ?? null,
    activity_type: p.activityType ?? null,
    difficulty: p.difficulty,
    distance_meters: p.distanceMeters,
    duration_seconds: p.durationSeconds,
    elevation_gain_meters: p.elevationGainMeters,
    elevation_loss_meters: p.elevationLossMeters,
    max_elevation_meters: p.maxElevationMeters,
    min_elevation_meters: p.minElevationMeters ?? 0,
    avg_speed_kmh: p.avgSpeedKmh,
    max_speed_kmh: p.maxSpeedKmh,
    started_at: p.startedAt.toISOString(),
    finished_at: p.finishedAt?.toISOString() ?? null,
    is_public: p.isPublic,
    parent_route_id: p.parentRouteId ?? null,
    created_at: p.createdAt.toISOString(),
  };
}
