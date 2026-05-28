import { Route } from '@core/entities/Route';
import { GpsPoint } from '@core/entities/GpsPoint';
import { Waypoint } from '@core/entities/Waypoint';
import { Difficulty } from '@core/value-objects/Difficulty';
import { routeRepository } from '@infrastructure/repositories/RouteRepositoryImpl';

export interface StartDraftInput {
  routeId: string;
  userId: string;
  name: string;
  description?: string;
  activityType?: string;
  difficulty: Difficulty;
  startedAt: Date;
  /** Si se grabó "siguiendo" otra ruta, ID de la padre. */
  parentRouteId?: string;
}

export interface RecoverableDraft {
  route: Route;
  gpsPoints: GpsPoint[];
  waypoints: Waypoint[];
}

/**
 * Crea la ruta como BORRADOR en SQLite al iniciar la grabación. A partir de
 * aquí cada punto/waypoint se persiste incrementalmente, de modo que si el SO
 * mata el proceso (background tracking largo) la ruta no se pierde.
 */
export async function startDraftRoute(input: StartDraftInput): Promise<void> {
  const route = Route.fromProps({
    id: input.routeId,
    userId: input.userId,
    name: input.name,
    description: input.description || undefined,
    activityType: input.activityType || undefined,
    difficulty: input.difficulty,
    distanceMeters: 0,
    durationSeconds: 0,
    elevationGainMeters: 0,
    elevationLossMeters: 0,
    maxElevationMeters: 0,
    minElevationMeters: 0,
    avgSpeedKmh: 0,
    maxSpeedKmh: 0,
    startedAt: input.startedAt,
    finishedAt: undefined,
    isPublic: false,
    isSynced: false,
    isDraft: true,
    parentRouteId: input.parentRouteId,
    createdAt: new Date(),
  });
  await routeRepository.createDraft(route);
}

export async function appendDraftGpsPoint(point: GpsPoint): Promise<void> {
  await routeRepository.appendGpsPoint(point);
}

export async function appendDraftWaypoint(wp: Waypoint): Promise<void> {
  await routeRepository.appendWaypoint(wp);
}

/**
 * Devuelve la grabación interrumpida (borrador) más reciente del usuario, con
 * sus puntos y waypoints. Si el borrador no tiene puntos GPS, lo descarta y
 * devuelve null (no hay nada que recuperar).
 */
export async function getRecoverableDraft(userId: string): Promise<RecoverableDraft | null> {
  const route = await routeRepository.getActiveDraft(userId);
  if (!route) return null;

  const gpsPoints = await routeRepository.getGpsPoints(route.id);
  if (gpsPoints.length === 0) {
    await routeRepository.delete(route.id);
    return null;
  }

  const waypoints = await routeRepository.getWaypoints(route.id);
  return { route, gpsPoints, waypoints };
}

/** Descarta un borrador (borra ruta + puntos + waypoints por CASCADE). */
export async function discardDraftRoute(routeId: string): Promise<void> {
  await routeRepository.delete(routeId);
}
