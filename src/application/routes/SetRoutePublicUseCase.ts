import { supabase } from '@infrastructure/supabase/supabaseClient';
import { NK_TABLES } from '@infrastructure/supabase/tables';
import { routeRepository } from '@infrastructure/repositories/RouteRepositoryImpl';

/**
 * Activa/desactiva la visibilidad pública de una ruta.
 *
 * - Siempre actualiza SQLite local.
 * - Si la ruta ya está sincronizada, actualiza también `is_public` en Supabase
 *   de inmediato. Si esa actualización remota falla, marca la ruta como no
 *   sincronizada para que el cambio se propague en el próximo sync.
 * - Si la ruta aún no está en la nube, basta con el cambio local: `is_public`
 *   subirá cuando se sincronice (routeToSupabase ya lo incluye).
 */
export async function setRoutePublicUseCase(routeId: string, isPublic: boolean): Promise<void> {
  await routeRepository.setPublic(routeId, isPublic);

  const route = await routeRepository.getById(routeId);
  if (route?.isSynced) {
    const { error } = await supabase
      .from(NK_TABLES.routes)
      .update({ is_public: isPublic })
      .eq('id', routeId);
    if (error) {
      // No se pudo actualizar el remoto → dejar pendiente para el próximo sync.
      await routeRepository.markUnsynced(routeId);
      throw new Error(error.message);
    }
  }
}
