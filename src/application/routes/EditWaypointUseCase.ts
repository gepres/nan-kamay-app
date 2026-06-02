import { routeRepository } from '@infrastructure/repositories/RouteRepositoryImpl';
import { WaypointMedia } from '@core/entities/Waypoint';

export interface EditWaypointInput {
  title: string;
  description?: string;
  type?: string;
  media: WaypointMedia[];
  /** Nueva ubicación si el usuario movió el punto en el mapa (ambos o ninguno). */
  latitude?: number;
  longitude?: number;
}

/**
 * Edita un waypoint (título, descripción, tipo y media) en SQLite y marca su
 * ruta como no sincronizada para que los cambios suban en el próximo sync
 * (el push hace upsert de waypoints y reconcilia la media: delete + insert, sin
 * re-subir las que ya tienen URL remota).
 *
 * Puede mover la posición (lat/lon) si el usuario la ajustó en el mapa; no
 * edita la altitud ni la fecha del waypoint.
 */
export async function editWaypointUseCase(waypointId: string, input: EditWaypointInput): Promise<void> {
  const title = input.title.trim();
  if (!title) throw new Error('El título no puede estar vacío.');

  await routeRepository.updateWaypoint(waypointId, {
    title,
    description: input.description?.trim() || null,
    type: input.type?.trim() || null,
    media: input.media,
    latitude: input.latitude,
    longitude: input.longitude,
  });

  const wp = await routeRepository.getWaypointById(waypointId);
  if (wp) await routeRepository.markUnsynced(wp.routeId);
}
