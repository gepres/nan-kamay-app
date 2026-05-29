import { routeRepository } from '@infrastructure/repositories/RouteRepositoryImpl';
import { fetchTerrainElevations } from '@infrastructure/services/ElevationService';
import { StatsCalculator } from '@core/rules/StatsCalculator';
import { GpsPoint } from '@core/entities/GpsPoint';

export interface RefineElevationResult {
  gain: number;
  loss: number;
  max: number;
  min: number;
  updatedPoints: number;
}

/**
 * Ajusta la elevación de una ruta usando el terreno real (DEM) en vez de la
 * altitud GPS: trae la elevación de OpenTopoData para los puntos del track,
 * reescribe sus altitudes en SQLite, recalcula gain/loss/max/min y marca la
 * ruta para re-sincronizar (así el ajuste sube a la nube).
 *
 * Requiere conexión. Lanza si la API falla; el caller muestra el error.
 */
export async function refineElevationUseCase(routeId: string): Promise<RefineElevationResult> {
  const route = await routeRepository.getById(routeId);
  if (!route) throw new Error('Ruta no encontrada');

  const points = await routeRepository.getGpsPoints(routeId);
  if (points.length < 2) throw new Error('La ruta no tiene puntos suficientes.');

  const elevations = await fetchTerrainElevations(
    points.map((p) => ({ latitude: p.latitude, longitude: p.longitude })),
  );

  // Actualizar SQLite solo donde el DEM devolvió un valor válido.
  const updates: { id: string; altitude: number | null }[] = [];
  const updatedPoints: GpsPoint[] = points.map((p, i) => {
    const elev = elevations[i];
    if (typeof elev === 'number') {
      updates.push({ id: p.id, altitude: elev });
      return GpsPoint.fromProps({ ...p.toProps(), altitude: elev });
    }
    return p;
  });

  if (updates.length === 0) {
    throw new Error('El servicio de elevación no devolvió datos para esta zona.');
  }

  await routeRepository.updateGpsAltitudes(updates);

  // Recalcular stats de elevación con las altitudes de terreno.
  const stats = StatsCalculator.calculate(updatedPoints, route.durationSeconds);
  const e = {
    gain: stats.elevationGainMeters,
    loss: stats.elevationLossMeters,
    max: stats.maxElevationMeters,
    min: stats.minElevationMeters,
  };
  await routeRepository.updateRouteElevation(routeId, e);

  // El track cambió → re-sincronizar para propagar el ajuste a la nube.
  await routeRepository.markUnsynced(routeId);

  return { ...e, updatedPoints: updates.length };
}
