import { Route } from '../../entities/Route';
import { GpsPoint } from '../../entities/GpsPoint';
import { Waypoint } from '../../entities/Waypoint';

export interface IRouteRepository {
  save(route: Route, gpsPoints: GpsPoint[], waypoints: Waypoint[]): Promise<void>;
  getAll(userId: string): Promise<Route[]>;
  getById(id: string): Promise<Route | null>;
  getGpsPoints(routeId: string): Promise<GpsPoint[]>;
  getWaypoints(routeId: string): Promise<Waypoint[]>;
  delete(id: string): Promise<void>;
  getUnsyncedRoutes(userId: string): Promise<Route[]>;
  markAsSynced(routeId: string): Promise<void>;
}
