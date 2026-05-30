import { routeRepository } from '@infrastructure/repositories/RouteRepositoryImpl';
import { WaypointMedia } from '@core/entities/Waypoint';

export interface EditWaypointInput {
  title: string;
  description?: string;
  type?: string;
  media: WaypointMedia[];
}

/**
 * Edita un waypoint (título, descripción, tipo y media) en SQLite y marca su
 * ruta como no sincronizada para que los cambios suban en el próximo sync
 * (el push hace upsert de waypoints y reconcilia la media: delete + insert, sin
 * re-subir las que ya tienen URL remota).
 *
 * No edita la posición (lat/lon/altitud) ni la fecha del waypoint.
 */
export async function editWaypointUseCase(waypointId: string, input: EditWaypointInput): Promise<void> {
  const title = input.title.trim();
  if (!title) throw new Error('El título no puede estar vacío.');

  await routeRepository.updateWaypoint(waypointId, {
    title,
    description: input.description?.trim() || null,
    type: input.type?.trim() || null,
    media: input.media,
  });

  const wp = await routeRepository.getWaypointById(waypointId);
  if (wp) await routeRepository.markUnsynced(wp.routeId);
}
