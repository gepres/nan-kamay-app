import { Route } from '../../entities/Route';
import { GpsPoint } from '../../entities/GpsPoint';
import { Waypoint } from '../../entities/Waypoint';

export type ExportFormat = 'gpx' | 'kml' | 'kmz';

export interface IExportService {
  exportRoute(
    route: Route,
    gpsPoints: GpsPoint[],
    waypoints: Waypoint[],
    format: ExportFormat,
  ): Promise<string>; // Retorna la URI del archivo exportado
}
