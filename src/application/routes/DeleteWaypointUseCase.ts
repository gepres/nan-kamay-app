import { routeRepository } from '@infrastructure/repositories/RouteRepositoryImpl';

/**
 * Borra un waypoint en SQLite y marca su ruta para re-sync. El push reconcilia
 * el borrado remoto (limpia su media de Storage + elimina la fila en Supabase),
 * de modo que el waypoint NO resucita al re-bajar en otro dispositivo.
 */
export async function deleteWaypointUseCase(waypointId: string): Promise<void> {
  await routeRepository.deleteWaypoint(waypointId);
}
