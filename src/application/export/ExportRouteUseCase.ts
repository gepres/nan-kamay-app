import { exportService } from '@infrastructure/services/ExportServiceImpl';
import { routeRepository } from '@infrastructure/repositories/RouteRepositoryImpl';
import { ExportFormat } from '@core/ports/services/IExportService';

export interface ExportRouteInput {
  routeId: string;
  format: ExportFormat;
}

/** Exporta una ruta guardada a GPX, KML o KMZ. Retorna la URI del archivo. */
export async function exportRouteUseCase(input: ExportRouteInput): Promise<string> {
  const { routeId, format } = input;

  const route = await routeRepository.getById(routeId);
  if (!route) throw new Error('Ruta no encontrada.');

  const [gpsPoints, waypoints] = await Promise.all([
    routeRepository.getGpsPoints(routeId),
    routeRepository.getWaypoints(routeId),
  ]);

  return exportService.exportRoute(route, gpsPoints, waypoints, format);
}
