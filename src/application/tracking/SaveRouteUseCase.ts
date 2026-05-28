import { Route } from '@core/entities/Route';
import { GpsPoint } from '@core/entities/GpsPoint';
import { Waypoint } from '@core/entities/Waypoint';
import { Difficulty } from '@core/value-objects/Difficulty';
import { RouteStats } from '@core/rules/StatsCalculator';
import { routeRepository } from '@infrastructure/repositories/RouteRepositoryImpl';

export interface SaveRouteInput {
  routeId: string;
  userId: string;
  name: string;
  description?: string;
  activityType?: string;
  difficulty: Difficulty;
  gpsPoints: GpsPoint[];
  waypoints: Waypoint[];
  stats: RouteStats;
  startedAt: Date;
  finishedAt: Date;
  isPublic?: boolean;
  /** Si se grabó "siguiendo" otra ruta, ID de la padre. */
  parentRouteId?: string;
}

export interface SaveRouteOutput {
  route: Route;
}

export async function saveRouteUseCase(input: SaveRouteInput): Promise<SaveRouteOutput> {
  const {
    routeId, userId, name, description, activityType, difficulty,
    gpsPoints, waypoints, stats, startedAt, finishedAt,
    isPublic = false, parentRouteId,
  } = input;

  if (gpsPoints.length === 0) {
    throw new Error('No se grabaron puntos GPS. La ruta no puede guardarse.');
  }

  const route = Route.fromProps({
    id: routeId,
    userId,
    name,
    difficulty,
    description: description || undefined,
    activityType: activityType || undefined,
    distanceMeters: stats.distanceMeters,
    durationSeconds: stats.durationSeconds,
    elevationGainMeters: stats.elevationGainMeters,
    elevationLossMeters: stats.elevationLossMeters,
    maxElevationMeters: stats.maxElevationMeters,
    minElevationMeters: stats.minElevationMeters,
    avgSpeedKmh: stats.avgSpeedKmh,
    maxSpeedKmh: stats.maxSpeedKmh,
    startedAt,
    finishedAt,
    isPublic,
    isSynced: false,
    parentRouteId,
    createdAt: new Date(),
  });

  await routeRepository.save(route, gpsPoints, waypoints);

  return { route };
}
