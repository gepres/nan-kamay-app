import { routeRepository } from '@infrastructure/repositories/RouteRepositoryImpl';
import { RouteGuide } from '@presentation/stores/trackingStore';

/**
 * Carga una ruta-padre (gps_points + waypoints) y la transforma en el shape
 * "guía" que consume el trackingStore para pintar la traza de referencia en
 * el mapa mientras el usuario graba su propio recorrido.
 *
 * Devuelve null si la ruta no existe o no tiene puntos suficientes para
 * pintar una línea (n < 2).
 */
export async function loadRouteGuide(parentRouteId: string): Promise<RouteGuide | null> {
  const route = await routeRepository.getById(parentRouteId);
  if (!route) return null;

  const [gpsPoints, waypoints] = await Promise.all([
    routeRepository.getGpsPoints(parentRouteId),
    routeRepository.getWaypoints(parentRouteId),
  ]);

  if (gpsPoints.length < 2) return null;

  return {
    parentRouteId: route.id,
    parentName: route.name,
    guidePoints: gpsPoints.map((p) => ({
      latitude: p.latitude,
      longitude: p.longitude,
    })),
    guideWaypoints: waypoints.map((wp) => ({
      latitude: wp.latitude,
      longitude: wp.longitude,
      title: wp.title,
    })),
  };
}
