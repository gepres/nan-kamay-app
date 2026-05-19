import { routeRepository } from '@infrastructure/repositories/RouteRepositoryImpl';
import { deleteRemoteRoute } from '@infrastructure/services/SyncServiceImpl';

export async function deleteRouteUseCase(routeId: string): Promise<void> {
  await routeRepository.delete(routeId);
  // Borrado remoto best-effort: si hay red y la ruta estaba sincronizada,
  // se elimina también en Supabase (A6). Sin red → queda remota (aceptado).
  try {
    await deleteRemoteRoute(routeId);
  } catch {
    // offline / no sincronizada: ignorar
  }
}
