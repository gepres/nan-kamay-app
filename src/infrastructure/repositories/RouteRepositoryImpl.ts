import { IRouteRepository } from '@core/ports/repositories/IRouteRepository';
import { Route } from '@core/entities/Route';
import { Difficulty } from '@core/value-objects/Difficulty';
import { GpsPoint } from '@core/entities/GpsPoint';
import { Waypoint, WaypointMedia } from '@core/entities/Waypoint';
import { RouteStats } from '@core/rules/StatsCalculator';
import { db } from '@infrastructure/database/sqliteDb';
import { rowToRoute, routeToRow } from '@infrastructure/mappers/RouteMapper';
import { rowToGpsPoint, gpsPointToRow } from '@infrastructure/mappers/GpsPointMapper';
import { rowToWaypoint, waypointToRow } from '@infrastructure/mappers/WaypointMapper';
import { downsampleElevation } from '@shared/utils/elevation';
import { simplifyLngLat } from '@shared/utils/geometry';
import { uuidv4 } from '@shared/utils/uuid';

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
           started_at, finished_at, is_public, is_synced, is_draft, is_planned, parent_route_id, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          routeRow.id, routeRow.user_id, routeRow.name, routeRow.description,
          routeRow.activity_type, routeRow.difficulty,
          routeRow.distance_meters, routeRow.duration_seconds,
          routeRow.elevation_gain_meters, routeRow.elevation_loss_meters,
          routeRow.max_elevation_meters, routeRow.min_elevation_meters,
          routeRow.avg_speed_kmh, routeRow.max_speed_kmh,
          routeRow.started_at, routeRow.finished_at,
          routeRow.is_public, routeRow.is_synced, routeRow.is_draft, routeRow.is_planned,
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
         started_at, finished_at, is_public, is_synced, is_draft, is_planned, parent_route_id, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,0,?,?)`,
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

  /** Inserta/actualiza un waypoint individual (incluye `media`: fotos/videos/
   *  audio). Antes omitía la columna `media` y se perdían videos/notas de voz. */
  async appendWaypoint(wp: Waypoint): Promise<void> {
    const r = waypointToRow(wp);
    await db.runAsync(
      `INSERT OR REPLACE INTO waypoints
        (id, route_id, latitude, longitude, altitude, title, description, type, image_uris, media, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [r.id, r.route_id, r.latitude, r.longitude,
       r.altitude, r.title, r.description, r.type, r.image_uris, r.media, r.created_at] as (string | number | null)[]
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

  /**
   * Persiste (o reemplaza) una ruta planificada: la fila `routes` con
   * is_planned=1 + los puntos dibujados como `gps_points`. No lleva stats de
   * grabación (las que trae la entidad: distancia estimada). INSERT OR REPLACE
   * sobre la ruta dispara el CASCADE que borra los puntos viejos (caso edición)
   * antes de reinsertar.
   */
  async savePlannedRoute(route: Route, points: { latitude: number; longitude: number }[]): Promise<void> {
    const r = routeToRow(route);
    const ts = route.createdAt.toISOString();
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `INSERT OR REPLACE INTO routes
          (id, user_id, name, description, activity_type, difficulty,
           distance_meters, duration_seconds,
           elevation_gain_meters, elevation_loss_meters, max_elevation_meters, min_elevation_meters,
           avg_speed_kmh, max_speed_kmh,
           started_at, finished_at, is_public, is_synced, is_draft, is_planned, parent_route_id, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,1,?,?)`,
        [
          r.id, r.user_id, r.name, r.description, r.activity_type, r.difficulty,
          r.distance_meters, r.duration_seconds,
          r.elevation_gain_meters, r.elevation_loss_meters, r.max_elevation_meters, r.min_elevation_meters,
          r.avg_speed_kmh, r.max_speed_kmh,
          r.started_at, r.finished_at, r.is_public, r.is_synced,
          r.parent_route_id, r.created_at,
        ] as (string | number | null)[]
      );
      // Borrado EXPLÍCITO de los puntos previos (caso edición). El REPLACE de
      // arriba ya dispara el ON DELETE CASCADE, pero no dependemos de que el
      // PRAGMA foreign_keys esté activo: si estuviera off, editar una ruta a
      // MENOS puntos dejaría huérfanos con sequence_index alto → guía corrupta.
      await db.runAsync('DELETE FROM gps_points WHERE route_id = ?', [r.id as string]);
      for (let i = 0; i < points.length; i++) {
        await db.runAsync(
          `INSERT OR IGNORE INTO gps_points
            (id, route_id, latitude, longitude, altitude, accuracy, speed, recorded_at, sequence_index)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [uuidv4(), r.id as string, points[i].latitude, points[i].longitude, null, null, null, ts, i] as (string | number | null)[]
        );
      }
    });
  }

  /** Rutas planificadas (dibujadas, no grabadas) del usuario, más recientes primero. */
  async getPlannedRoutes(userId: string): Promise<Route[]> {
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM routes WHERE user_id = ? AND is_planned = 1 ORDER BY created_at DESC',
      [userId]
    );
    return rows.map(rowToRoute);
  }

  async getAll(userId: string): Promise<Route[]> {
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM routes WHERE user_id = ? AND is_draft = 0 AND is_planned = 0 ORDER BY created_at DESC',
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

  /**
   * Polilíneas `[lon,lat][]` simplificadas de TODAS las rutas no-borrador del
   * usuario, en una sola consulta. Para el mapa de calor personal del perfil.
   * Simplifica con ε mayor (heatmap compacto, no necesita fidelidad fina).
   */
  async getAllTrackPolylines(userId: string): Promise<[number, number][][]> {
    const rows = await db.getAllAsync<{ route_id: string; longitude: number; latitude: number }>(
      `SELECT g.route_id, g.longitude, g.latitude
         FROM gps_points g JOIN routes r ON r.id = g.route_id
        WHERE r.user_id = ? AND r.is_draft = 0 AND r.is_planned = 0
        ORDER BY g.route_id, g.sequence_index ASC`,
      [userId]
    );
    const byRoute = new Map<string, [number, number][]>();
    for (const row of rows) {
      const arr = byRoute.get(row.route_id) ?? [];
      arr.push([row.longitude, row.latitude]);
      byRoute.set(row.route_id, arr);
    }
    const out: [number, number][][] = [];
    for (const coords of byRoute.values()) {
      if (coords.length >= 2) out.push(simplifyLngLat(coords, 8));
    }
    return out;
  }

  /** Ancla (primer punto GPS) + metadatos de cada ruta no-borrador del usuario.
   *  Para agrupar rutas por zona geográfica. */
  async getRouteAnchors(userId: string): Promise<
    { routeId: string; name: string; distanceMeters: number; elevationGainMeters: number; activityType?: string; lat: number; lon: number }[]
  > {
    const rows = await db.getAllAsync<{
      id: string; name: string; distance_meters: number; elevation_gain_meters: number | null;
      activity_type: string | null; lat: number | null; lon: number | null;
    }>(
      `SELECT r.id, r.name, r.distance_meters, r.elevation_gain_meters, r.activity_type,
              (SELECT latitude  FROM gps_points WHERE route_id = r.id ORDER BY sequence_index LIMIT 1) AS lat,
              (SELECT longitude FROM gps_points WHERE route_id = r.id ORDER BY sequence_index LIMIT 1) AS lon
         FROM routes r
        WHERE r.user_id = ? AND r.is_draft = 0 AND r.is_planned = 0`,
      [userId]
    );
    return rows
      .filter((r) => r.lat != null && r.lon != null)
      .map((r) => ({
        routeId: r.id, name: r.name, distanceMeters: r.distance_meters,
        elevationGainMeters: r.elevation_gain_meters ?? 0,
        activityType: r.activity_type ?? undefined, lat: r.lat as number, lon: r.lon as number,
      }));
  }

  /** Waypoints (título/tipo/coords) de todas las rutas no-borrador del usuario. */
  async getAllWaypointsLite(userId: string): Promise<{ title: string; type?: string; lat: number; lon: number }[]> {
    const rows = await db.getAllAsync<{ title: string; type: string | null; latitude: number; longitude: number }>(
      `SELECT w.title, w.type, w.latitude, w.longitude
         FROM waypoints w JOIN routes r ON r.id = w.route_id
        WHERE r.user_id = ? AND r.is_draft = 0 AND r.is_planned = 0`,
      [userId]
    );
    return rows.map((r) => ({ title: r.title, type: r.type ?? undefined, lat: r.latitude, lon: r.longitude }));
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

  /** Actualiza los campos editables de un waypoint (título, descripción, tipo,
   *  media y, opcionalmente, su ubicación lat/lon si el usuario la movió). */
  async updateWaypoint(
    id: string,
    fields: {
      title: string; description: string | null; type: string | null; media: WaypointMedia[];
      latitude?: number; longitude?: number;
    },
  ): Promise<void> {
    const imageUris = fields.media.filter((m) => m.type === 'image').map((m) => m.uri);
    const moveLocation = fields.latitude != null && fields.longitude != null;
    const sql = moveLocation
      ? 'UPDATE waypoints SET title = ?, description = ?, type = ?, media = ?, image_uris = ?, latitude = ?, longitude = ? WHERE id = ?'
      : 'UPDATE waypoints SET title = ?, description = ?, type = ?, media = ?, image_uris = ? WHERE id = ?';
    const params = moveLocation
      ? [fields.title, fields.description, fields.type, JSON.stringify(fields.media), JSON.stringify(imageUris), fields.latitude!, fields.longitude!, id]
      : [fields.title, fields.description, fields.type, JSON.stringify(fields.media), JSON.stringify(imageUris), id];
    await db.runAsync(sql, params);
  }

  async delete(id: string): Promise<void> {
    // ON DELETE CASCADE borra gps_points y waypoints automáticamente
    await db.runAsync('DELETE FROM routes WHERE id = ?', [id]);
  }

  async getUnsyncedRoutes(userId: string): Promise<Route[]> {
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM routes WHERE user_id = ? AND is_synced = 0 AND is_draft = 0 AND is_planned = 0 ORDER BY created_at ASC',
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

  /**
   * Reemplaza TODOS los gps_points de una ruta por `points` (editor de trazado).
   * DELETE-all + INSERT re-secuenciado 0..n-1 PRESERVANDO id/altitud/accuracy/
   * speed/recordedAt de cada punto (a diferencia de `savePlannedRoute`, que los
   * nula): los supervivientes conservan su id; los redibujados traen uuid nuevo.
   *
   * SIEMPRE DELETE-all + reinsert; NUNCA UPDATE de `sequence_index`: hay un
   * UNIQUE INDEX (route_id, sequence_index) que colisionaría transitoriamente al
   * reordenar dentro de la transacción.
   */
  async replaceGpsPoints(routeId: string, points: GpsPoint[]): Promise<void> {
    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM gps_points WHERE route_id = ?', [routeId]);
      const BATCH = 100;
      for (let i = 0; i < points.length; i += BATCH) {
        const batch = points.slice(i, i + BATCH);
        for (let j = 0; j < batch.length; j++) {
          const r = gpsPointToRow(batch[j]);
          await db.runAsync(
            `INSERT OR IGNORE INTO gps_points
              (id, route_id, latitude, longitude, altitude, accuracy, speed, recorded_at, sequence_index)
             VALUES (?,?,?,?,?,?,?,?,?)`,
            [r.id, routeId, r.latitude, r.longitude,
             r.altitude, r.accuracy, r.speed, r.recorded_at, i + j] as (string | number | null)[]
          );
        }
      }
    });
  }

  /**
   * Reescribe TODAS las stats de una ruta (tras editar el trazado): distancia,
   * duración, velocidad y elevación. (`updateRouteElevation` solo toca las 4 de
   * elevación, para el ajuste por DEM.)
   */
  async updateRouteStats(routeId: string, stats: RouteStats): Promise<void> {
    await db.runAsync(
      `UPDATE routes SET
         distance_meters = ?, duration_seconds = ?,
         elevation_gain_meters = ?, elevation_loss_meters = ?,
         max_elevation_meters = ?, min_elevation_meters = ?,
         avg_speed_kmh = ?, max_speed_kmh = ?
       WHERE id = ?`,
      [stats.distanceMeters, stats.durationSeconds,
       stats.elevationGainMeters, stats.elevationLossMeters,
       stats.maxElevationMeters, stats.minElevationMeters,
       stats.avgSpeedKmh, stats.maxSpeedKmh, routeId]
    );
  }

  /**
   * Borra un waypoint y marca su ruta para re-sync. El push reconcilia el
   * borrado remoto (limpia Storage y elimina la fila en Supabase).
   */
  async deleteWaypoint(id: string): Promise<void> {
    const wp = await this.getWaypointById(id);
    if (!wp) return;
    await db.runAsync('DELETE FROM waypoints WHERE id = ?', [id]);
    await this.markUnsynced(wp.routeId);
  }
}

// Singleton
export const routeRepository = new RouteRepositoryImpl();
