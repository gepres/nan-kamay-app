import { IRouteRepository } from '@core/ports/repositories/IRouteRepository';
import { Route } from '@core/entities/Route';
import { Difficulty } from '@core/value-objects/Difficulty';
import { GpsPoint } from '@core/entities/GpsPoint';
import { Waypoint, WaypointMedia } from '@core/entities/Waypoint';
import { db } from '@infrastructure/database/sqliteDb';
import { rowToRoute, routeToRow } from '@infrastructure/mappers/RouteMapper';
import { rowToGpsPoint, gpsPointToRow } from '@infrastructure/mappers/GpsPointMapper';
import { rowToWaypoint, waypointToRow } from '@infrastructure/mappers/WaypointMapper';
import { downsampleElevation } from '@shared/utils/elevation';

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
          (id, user_id, name, description, activity_type, difficulty,
           distance_meters, duration_seconds,
           elevation_gain_meters, elevation_loss_meters, max_elevation_meters, min_elevation_meters,
           avg_speed_kmh, max_speed_kmh,
           started_at, finished_at, is_public, is_synced, is_draft, parent_route_id, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          routeRow.id, routeRow.user_id, routeRow.name, routeRow.description,
          routeRow.activity_type, routeRow.difficulty,
          routeRow.distance_meters, routeRow.duration_seconds,
          routeRow.elevation_gain_meters, routeRow.elevation_loss_meters,
          routeRow.max_elevation_meters, routeRow.min_elevation_meters,
          routeRow.avg_speed_kmh, routeRow.max_speed_kmh,
          routeRow.started_at, routeRow.finished_at,
          routeRow.is_public, routeRow.is_synced, routeRow.is_draft,
          routeRow.parent_route_id, routeRow.created_at,
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
            (id, route_id, latitude, longitude, altitude, title, description, type, image_uris, media, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [r.id, r.route_id, r.latitude, r.longitude,
           r.altitude, r.title, r.description, r.type, r.image_uris, r.media, r.created_at] as (string | number | null)[]
        );
      }
    });
  }

  /**
   * Crea (o reemplaza) la fila de ruta como BORRADOR (is_draft = 1), sin
   * puntos. A partir de aquí los puntos/waypoints se persisten incrementalmente
   * para sobrevivir a un cierre/kill del proceso durante la grabación.
   */
  async createDraft(route: Route): Promise<void> {
    const r = routeToRow(route);
    await db.runAsync(
      `INSERT OR REPLACE INTO routes
        (id, user_id, name, description, activity_type, difficulty,
         distance_meters, duration_seconds,
         elevation_gain_meters, elevation_loss_meters, max_elevation_meters, min_elevation_meters,
         avg_speed_kmh, max_speed_kmh,
         started_at, finished_at, is_public, is_synced, is_draft, parent_route_id, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`,
      [
        r.id, r.user_id, r.name, r.description, r.activity_type, r.difficulty,
        r.distance_meters, r.duration_seconds,
        r.elevation_gain_meters, r.elevation_loss_meters, r.max_elevation_meters,
        r.min_elevation_meters, r.avg_speed_kmh, r.max_speed_kmh,
        r.started_at, r.finished_at, r.is_public, r.is_synced,
        r.parent_route_id, r.created_at,
      ] as (string | number | null)[]
    );
  }

  /** Inserta un punto GPS individual (idempotente por id). */
  async appendGpsPoint(point: GpsPoint): Promise<void> {
    const r = gpsPointToRow(point);
    await db.runAsync(
      `INSERT OR IGNORE INTO gps_points
        (id, route_id, latitude, longitude, altitude, accuracy, speed, recorded_at, sequence_index)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [r.id, r.route_id, r.latitude, r.longitude,
       r.altitude, r.accuracy, r.speed, r.recorded_at, r.sequence_index] as (string | number | null)[]
    );
  }

  /** Inserta/actualiza un waypoint individual. */
  async appendWaypoint(wp: Waypoint): Promise<void> {
    const r = waypointToRow(wp);
    await db.runAsync(
      `INSERT OR REPLACE INTO waypoints
        (id, route_id, latitude, longitude, altitude, title, description, type, image_uris, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [r.id, r.route_id, r.latitude, r.longitude,
       r.altitude, r.title, r.description, r.type, r.image_uris, r.created_at] as (string | number | null)[]
    );
  }

  /** Borrador de grabación interrumpida más reciente (is_draft = 1), si existe. */
  async getActiveDraft(userId: string): Promise<Route | null> {
    const row = await db.getFirstAsync<Record<string, unknown>>(
      'SELECT * FROM routes WHERE user_id = ? AND is_draft = 1 ORDER BY created_at DESC LIMIT 1',
      [userId]
    );
    return row ? rowToRoute(row) : null;
  }

  async getAll(userId: string): Promise<Route[]> {
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM routes WHERE user_id = ? AND is_draft = 0 ORDER BY created_at DESC',
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

  /**
   * Perfiles de elevación (muestras normalizadas) de varias rutas en UNA sola
   * query, para dibujar la "firma" en las cards de la lista sin N consultas.
   */
  async getElevationProfiles(routeIds: string[]): Promise<Record<string, number[]>> {
    if (routeIds.length === 0) return {};
    const placeholders = routeIds.map(() => '?').join(',');
    const rows = await db.getAllAsync<{ route_id: string; altitude: number | null }>(
      `SELECT route_id, altitude FROM gps_points
        WHERE route_id IN (${placeholders})
        ORDER BY route_id, sequence_index ASC`,
      routeIds
    );
    const byRoute: Record<string, (number | null)[]> = {};
    for (const r of rows) {
      (byRoute[r.route_id] ??= []).push(r.altitude);
    }
    const out: Record<string, number[]> = {};
    for (const [id, alts] of Object.entries(byRoute)) {
      const s = downsampleElevation(alts);
      if (s) out[id] = s;
    }
    return out;
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

  async getWaypointById(id: string): Promise<Waypoint | null> {
    const row = await db.getFirstAsync<Record<string, unknown>>(
      'SELECT * FROM waypoints WHERE id = ?',
      [id]
    );
    return row ? rowToWaypoint(row) : null;
  }

  /** Actualiza los campos editables de un waypoint (título, descripción, tipo, media). */
  async updateWaypoint(
    id: string,
    fields: { title: string; description: string | null; type: string | null; media: WaypointMedia[] },
  ): Promise<void> {
    const imageUris = fields.media.filter((m) => m.type === 'image').map((m) => m.uri);
    await db.runAsync(
      'UPDATE waypoints SET title = ?, description = ?, type = ?, media = ?, image_uris = ? WHERE id = ?',
      [fields.title, fields.description, fields.type, JSON.stringify(fields.media), JSON.stringify(imageUris), id]
    );
  }

  async delete(id: string): Promise<void> {
    // ON DELETE CASCADE borra gps_points y waypoints automáticamente
    await db.runAsync('DELETE FROM routes WHERE id = ?', [id]);
  }

  async getUnsyncedRoutes(userId: string): Promise<Route[]> {
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM routes WHERE user_id = ? AND is_synced = 0 AND is_draft = 0 ORDER BY created_at ASC',
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

  /** Marca una ruta como pendiente de subir (forzar re-sync). */
  async markUnsynced(routeId: string): Promise<void> {
    await db.runAsync(
      'UPDATE routes SET is_synced = 0 WHERE id = ?',
      [routeId]
    );
  }

  /** Actualiza la metadata editable de una ruta en SQLite. */
  async updateMeta(
    routeId: string,
    fields: { name: string; description: string | null; difficulty: Difficulty; activityType: string | null },
  ): Promise<void> {
    await db.runAsync(
      `UPDATE routes SET name = ?, description = ?, difficulty = ?, activity_type = ? WHERE id = ?`,
      [fields.name, fields.description, fields.difficulty, fields.activityType, routeId]
    );
  }

  /** Cambia el flag is_public de una ruta en SQLite. */
  async setPublic(routeId: string, isPublic: boolean): Promise<void> {
    await db.runAsync(
      'UPDATE routes SET is_public = ? WHERE id = ?',
      [isPublic ? 1 : 0, routeId]
    );
  }

  /** Actualiza la altitud de varios puntos GPS (P1 — ajuste por DEM). */
  async updateGpsAltitudes(updates: { id: string; altitude: number | null }[]): Promise<void> {
    await db.withTransactionAsync(async () => {
      for (const u of updates) {
        await db.runAsync('UPDATE gps_points SET altitude = ? WHERE id = ?', [
          u.altitude,
          u.id,
        ]);
      }
    });
  }

  /** Reescribe las stats de elevación de una ruta (tras recalcular con DEM). */
  async updateRouteElevation(
    routeId: string,
    e: { gain: number; loss: number; max: number; min: number },
  ): Promise<void> {
    await db.runAsync(
      `UPDATE routes SET
         elevation_gain_meters = ?, elevation_loss_meters = ?,
         max_elevation_meters = ?, min_elevation_meters = ?
       WHERE id = ?`,
      [e.gain, e.loss, e.max, e.min, routeId]
    );
  }

  /**
   * Reemplaza la media de un waypoint por la versión con URLs remotas tras
   * subirlas. Así un re-sync ve URLs `http` y no las vuelve a subir.
   * Actualiza también `image_uris` (derivado) por compatibilidad.
   */
  async updateWaypointMedia(
    waypointId: string,
    media: { type: string; uri: string; durationMs?: number; thumbnailUri?: string }[],
  ): Promise<void> {
    const imageUris = media.filter((m) => m.type === 'image').map((m) => m.uri);
    await db.runAsync(
      'UPDATE waypoints SET media = ?, image_uris = ? WHERE id = ?',
      [JSON.stringify(media), JSON.stringify(imageUris), waypointId]
    );
  }
}

// Singleton
export const routeRepository = new RouteRepositoryImpl();
