import { syncRouteById } from '@infrastructure/services/SyncServiceImpl';

/**
 * Fuerza la subida a la nube de una ruta concreta (route + gps + waypoints +
 * imágenes), aunque ya estuviera marcada como sincronizada. Sirve para
 * re-subir fotos/waypoints que no llegaron en una sincronización previa.
 */
export async function syncRouteUseCase(routeId: string, userId: string): Promise<void> {
  return syncRouteById(routeId, userId);
}
