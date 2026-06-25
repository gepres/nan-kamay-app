import { routeRepository } from '@infrastructure/repositories/RouteRepositoryImpl';
import { StatsCalculator } from '@core/rules/StatsCalculator';
import { GpsPoint } from '@core/entities/GpsPoint';

/**
 * Reemplaza el trazado de una ruta por `points` (resultado del editor manual:
 * recortar extremos / quitar tramo / suavizar / redibujar / borrar outlier),
 * recalcula TODAS las stats con la nueva geometría y duración, y marca la ruta
 * para re-sincronizar (el push reconcilia el borrado de los puntos quitados).
 *
 * `durationSeconds` lo decide el EDITOR (StatsCalculator NO lo deriva):
 *  - tras recortar  → tiempo entre el primer y el último punto que quedan;
 *  - tras quitar un tramo → duración original menos el span removido.
 *
 * Sigue el molde de `refineElevationUseCase`: muta puntos → recalcula stats →
 * persiste → markUnsynced. Lanza si la ruta queda con menos de 2 puntos.
 */
export async function refineTrackUseCase(
  routeId: string,
  points: GpsPoint[],
  durationSeconds: number,
): Promise<void> {
  if (points.length < 2) throw new Error('La ruta debe quedar con al menos 2 puntos.');

  const stats = StatsCalculator.calculate(points, durationSeconds);
  await routeRepository.replaceGpsPoints(routeId, points);
  await routeRepository.updateRouteStats(routeId, stats);
  await routeRepository.markUnsynced(routeId);
}
