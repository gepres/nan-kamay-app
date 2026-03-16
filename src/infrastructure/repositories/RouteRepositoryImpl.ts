import { IRouteRepository } from '@core/ports/repositories/IRouteRepository';
import { Route } from '@core/entities/Route';
import { GpsPoint } from '@core/entities/GpsPoint';
import { Waypoint } from '@core/entities/Waypoint';
import { db } from '@infrastructure/database/sqliteDb';
import { rowToRoute, routeToRow } from '@infrastructure/mappers/RouteMapper';
import { rowToGpsPoint, gpsPointToRow } from '@infrastructure/mappers/GpsPointMapper';
import { rowToWaypoint, waypointToRow } from '@infrastructure/mappers/WaypointMapper';

export class RouteRepositoryImpl implements IRouteRepository {
  /**
   * Guarda una ruta completa (route + gps_points + waypoints) en una sola
   * transacción SQLite. Offline-first: is_synced = 0 por defecto.
   */
  async save(route: Route, gpsPoints: GpsPoint[], waypoints: Waypoint[]): Promise<void> {
    const routeRow = routeToRow(route);

    await db.withTransactionAsync(async () => {
      // 1. Ruta principal
      await db.runAsync(
        `INSERT OR REPLACE INTO routes
          (id, user_id, name, description, difficulty,
           distance_meters, duration_seconds,
           elevation_gain_meters, elevation_loss_meters, max_elevation_meters,
           avg_speed_kmh, max_speed_kmh,
           started_at, finished_at, is_public, is_synced, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          routeRow.id, routeRow.user_id, routeRow.name, routeRow.description,
          routeRow.difficulty, routeRow.distance_meters, routeRow.duration_seconds,
          routeRow.elevation_gain_meters, routeRow.elevation_loss_meters,
          routeRow.max_elevation_meters, routeRow.avg_speed_kmh, routeRow.max_speed_kmh,
          routeRow.started_at, routeRow.finished_at,
          routeRow.is_public, routeRow.is_synced, routeRow.created_at,
        ] as (string | number | null)[]
      );

      // 2. Puntos GPS (en lotes de 100 para evitar statements muy largos)
      const BATCH = 100;
      for (let i = 0; i < gpsPoints.length; i += BATCH) {
        const batch = gpsPoints.slice(i, i + BATCH);
        for (const pt of batch) {
          const r = gpsPointToRow(pt);
          await db.runAsync(
            `INSERT OR IGNORE INTO gps_points
              (id, route_id, latitude, longitude, altitude, accuracy, speed, recorded_at, sequence_index)
             VALUES (?,?,?,?,?,?,?,?,?)`,
            [r.id, r.route_id, r.latitude, r.longitude,
             r.altitude, r.accuracy, r.speed, r.recorded_at, r.sequence_index] as (string | number | null)[]
          );
        }
      }

      // 3. Waypoints
      for (const wp of waypoints) {
        const r = waypointToRow(wp);
        await db.runAsync(
          `INSERT OR REPLACE INTO waypoints
            (id, route_id, latitude, longitude, altitude, title, description, image_uris, created_at)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [r.id, r.route_id, r.latitude, r.longitude,
           r.altitude, r.title, r.description, r.image_uris, r.created_at] as (string | number | null)[]
        );
      }
    });
  }

  async getAll(userId: string): Promise<Route[]> {
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM routes WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    return rows.map(rowToRoute);
  }

  async getById(id: string): Promise<Route | null> {
    const row = await db.getFirstAsync<Record<string, unknown>>(
      'SELECT * FROM routes WHERE id = ?',
      [id]
    );
    return row ? rowToRoute(row) : null;
  }

  async getGpsPoints(routeId: string): Promise<GpsPoint[]> {
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM gps_points WHERE route_id = ? ORDER BY sequence_index ASC',
      [routeId]
    );
    return rows.map(rowToGpsPoint);
  }

  async getWaypoints(routeId: string): Promise<Waypoint[]> {
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM waypoints WHERE route_id = ? ORDER BY created_at ASC',
      [routeId]
    );
    return rows.map(rowToWaypoint);
  }

  async delete(id: string): Promise<void> {
    // ON DELETE CASCADE borra gps_points y waypoints automáticamente
    await db.runAsync('DELETE FROM routes WHERE id = ?', [id]);
  }

  async getUnsyncedRoutes(userId: string): Promise<Route[]> {
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM routes WHERE user_id = ? AND is_synced = 0 ORDER BY created_at ASC',
      [userId]
    );
    return rows.map(rowToRoute);
  }

  async markAsSynced(routeId: string): Promise<void> {
    await db.runAsync(
      'UPDATE routes SET is_synced = 1 WHERE id = ?',
      [routeId]
    );
  }
}

// Singleton
export const routeRepository = new RouteRepositoryImpl();
