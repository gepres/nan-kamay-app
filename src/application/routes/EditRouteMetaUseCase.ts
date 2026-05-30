import { supabase } from '@infrastructure/supabase/supabaseClient';
import { NK_TABLES } from '@infrastructure/supabase/tables';
import { routeRepository } from '@infrastructure/repositories/RouteRepositoryImpl';
import { Difficulty } from '@core/value-objects/Difficulty';

export interface EditRouteMetaInput {
  name: string;
  description?: string;
  difficulty: Difficulty;
  activityType?: string;
}

/**
 * Edita la metadata de una ruta (nombre, descripción, dificultad, actividad).
 *
 * Mismo patrón que `setRoutePublicUseCase`:
 * - Siempre actualiza SQLite local.
 * - Si la ruta ya está sincronizada, actualiza también el remoto de inmediato;
 *   si el remoto falla, marca la ruta como no sincronizada para reintentar en
 *   el próximo sync (routeToSupabase ya incluye estos campos).
 * - Si la ruta aún no está en la nube, basta el cambio local.
 *
 * No toca stats derivadas (distancia, duración, elevación) ni el track GPS.
 */
export async function editRouteMetaUseCase(routeId: string, input: EditRouteMetaInput): Promise<void> {
  const name = input.name.trim();
  if (!name) throw new Error('El nombre no puede estar vacío.');

  const fields = {
    name,
    description: input.description?.trim() || null,
    difficulty: input.difficulty,
    activityType: input.activityType?.trim() || null,
  };

  await routeRepository.updateMeta(routeId, fields);

  const route = await routeRepository.getById(routeId);
  if (route?.isSynced) {
    const { error } = await supabase
      .from(NK_TABLES.routes)
      .update({
        name: fields.name,
        description: fields.description,
        difficulty: fields.difficulty,
        activity_type: fields.activityType,
      })
      .eq('id', routeId);
    if (error) {
      await routeRepository.markUnsynced(routeId);
      throw new Error(error.message);
    }
  }
}
