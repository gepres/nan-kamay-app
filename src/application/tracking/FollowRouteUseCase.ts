import { routeRepository } from '@infrastructure/repositories/RouteRepositoryImpl';
import { getPublicRouteDetailUseCase } from '@application/routes/GetPublicRouteDetailUseCase';
import { RouteGuide } from '@presentation/stores/trackingStore';

/**
 * Carga una ruta-padre (gps_points + waypoints) y la transforma en el shape
 * "guía" que consume el trackingStore para pintar la traza de referencia en
 * el mapa mientras el usuario graba su propio recorrido.
 *
 * Busca primero en SQLite local (ruta propia); si no existe, la trae de
 * Supabase como ruta pública (seguir una ruta de otro usuario). Devuelve null
 * si no existe o no tiene puntos suficientes para pintar una línea (n < 2).
 */
export async function loadRouteGuide(parentRouteId: string): Promise<RouteGuide | null> {
  let route = await routeRepository.getById(parentRouteId);
  let gpsPoints, waypoints;

  if (route) {
    [gpsPoints, waypoints] = await Promise.all([
      routeRepository.getGpsPoints(parentRouteId),
      routeRepository.getWaypoints(parentRouteId),
    ]);
  } else {
    const remote = await getPublicRouteDetailUseCase(parentRouteId);
    if (!remote) return null;
    route = remote.route;
    gpsPoints = remote.gpsPoints;
    waypoints = remote.waypoints;
  }

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
