import { routeRepository } from '@infrastructure/repositories/RouteRepositoryImpl';
import { Waypoint, WaypointMedia } from '@core/entities/Waypoint';

export interface AddWaypointInput {
  title: string;
  description?: string;
  type?: string;
  media: WaypointMedia[];
  latitude: number;
  longitude: number;
  altitude: number | null;
}

/**
 * Crea un waypoint NUEVO en una ruta ya guardada (post-grabación) y marca la
 * ruta para re-sincronizar. Espejo de `editWaypointUseCase` pero para alta. El
 * push sube el waypoint (upsert) y su media.
 */
export async function addWaypointUseCase(routeId: string, input: AddWaypointInput): Promise<void> {
  const title = input.title.trim();
  if (!title) throw new Error('El título no puede estar vacío.');

  const wp = Waypoint.create({
    routeId,
    latitude: input.latitude,
    longitude: input.longitude,
    altitude: input.altitude,
    title,
    description: input.description?.trim() || undefined,
    type: input.type?.trim() || undefined,
    media: input.media,
  });

  await routeRepository.appendWaypoint(wp);
  await routeRepository.markUnsynced(routeId);
}
