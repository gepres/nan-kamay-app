import * as SQLite from 'expo-sqlite';

export const db = SQLite.openDatabaseSync('nan_kamay.db');

/**
 * Aplica migraciones idempotentes para bases de datos locales ya creadas
 * (no hay sistema de versiones; `CREATE TABLE IF NOT EXISTS` no añade
 * columnas a tablas existentes). Cada `ALTER TABLE` se ignora si la columna
 * ya existe ("duplicate column name").
 */
async function runMigrations(): Promise<void> {
  const alters = [
    `ALTER TABLE routes ADD COLUMN activity_type TEXT`,
    `ALTER TABLE routes ADD COLUMN is_draft INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE routes ADD COLUMN min_elevation_meters REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE routes ADD COLUMN parent_route_id TEXT`,
    `ALTER TABLE waypoints ADD COLUMN type TEXT`,
    `ALTER TABLE waypoints ADD COLUMN media TEXT NOT NULL DEFAULT '[]'`,
  ];
  for (const sql of alters) {
    try {
      await db.execAsync(sql);
    } catch {
      // columna ya existe → no-op
    }
  }

  // ── Dedupe + UNIQUE(route_id, sequence_index) ──
  // Hasta 2026-05-26 el hook reiniciaba `sequenceRef` a 0 al reanudar un
  // borrador, así que la DB acumulaba filas con (route_id, seq) repetidos.
  // Sin UNIQUE constraint, `INSERT OR IGNORE` no los rechazaba y al recuperar
  // (ORDER BY sequence_index) las dos cronologías se intercalaban → la traza
  // se veía como un zigzag. Esta migración:
  //   1) Borra duplicados conservando la fila más antigua por `recorded_at`.
  //   2) Crea el UNIQUE INDEX como red de seguridad (junto con el fix del hook).
  // Es idempotente: si no hay duplicados, no borra nada; si el índice ya
  // existe, IF NOT EXISTS lo respeta.
  try {
    await db.execAsync(`
      DELETE FROM gps_points WHERE id IN (
        SELECT g1.id FROM gps_points g1
        JOIN gps_points g2
          ON g1.route_id = g2.route_id
         AND g1.sequence_index = g2.sequence_index
         AND g1.id <> g2.id
         AND (
           g1.recorded_at > g2.recorded_at
           OR (g1.recorded_at = g2.recorded_at AND g1.id > g2.id)
         )
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uk_gps_points_route_seq
        ON gps_points(route_id, sequence_index);
    `);
  } catch (e) {
    // Si por alguna razón la unicidad sigue rota tras el DELETE, dejamos
    // constancia pero no rompemos el arranque de la app.
    console.warn('[sqlite] migración UNIQUE gps_points falló:', e);
  }
}

/** Inicializa las tablas locales (offline-first) */
export async function initDatabase(): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS routes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      activity_type TEXT,
      difficulty TEXT NOT NULL DEFAULT 'easy',
      distance_meters REAL NOT NULL DEFAULT 0,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      elevation_gain_meters REAL NOT NULL DEFAULT 0,
      elevation_loss_meters REAL NOT NULL DEFAULT 0,
      max_elevation_meters REAL NOT NULL DEFAULT 0,
      min_elevation_meters REAL NOT NULL DEFAULT 0,
      avg_speed_kmh REAL NOT NULL DEFAULT 0,
      max_speed_kmh REAL NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      is_public INTEGER NOT NULL DEFAULT 0,
      is_synced INTEGER NOT NULL DEFAULT 0,
      is_draft INTEGER NOT NULL DEFAULT 0,
      parent_route_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS gps_points (
      id TEXT PRIMARY KEY,
      route_id TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      altitude REAL,
      accuracy REAL,
      speed REAL,
      recorded_at TEXT NOT NULL,
      sequence_index INTEGER NOT NULL,
      FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS waypoints (
      id TEXT PRIMARY KEY,
      route_id TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      altitude REAL,
      title TEXT NOT NULL,
      description TEXT,
      type TEXT,
      image_uris TEXT NOT NULL DEFAULT '[]',
      media TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_routes_user_id ON routes(user_id);
    CREATE INDEX IF NOT EXISTS idx_gps_points_route_id ON gps_points(route_id);
    CREATE INDEX IF NOT EXISTS idx_waypoints_route_id ON waypoints(route_id);
  `);

  await runMigrations();
}
