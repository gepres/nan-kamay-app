import { Route } from '../../entities/Route';
import { GpsPoint } from '../../entities/GpsPoint';
import { Waypoint, WaypointMedia } from '../../entities/Waypoint';

export interface IRouteRepository {
  save(route: Route, gpsPoints: GpsPoint[], waypoints: Waypoint[]): Promise<void>;
  createDraft(route: Route): Promise<void>;
  appendGpsPoint(point: GpsPoint): Promise<void>;
  appendWaypoint(wp: Waypoint): Promise<void>;
  getActiveDraft(userId: string): Promise<Route | null>;
  savePlannedRoute(route: Route, points: { latitude: number; longitude: number }[]): Promise<void>;
  getPlannedRoutes(userId: string): Promise<Route[]>;
  getAll(userId: string): Promise<Route[]>;
  getById(id: string): Promise<Route | null>;
  getGpsPoints(routeId: string): Promise<GpsPoint[]>;
  getWaypoints(routeId: string): Promise<Waypoint[]>;
  delete(id: string): Promise<void>;
  getUnsyncedRoutes(userId: string): Promise<Route[]>;
  markAsSynced(routeId: string): Promise<void>;
  updateWaypointMedia(waypointId: string, media: WaypointMedia[]): Promise<void>;
}
