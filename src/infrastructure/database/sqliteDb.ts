import * as SQLite from 'expo-sqlite';

export const db = SQLite.openDatabaseSync('nan_kamay.db');

/** Inicializa las tablas locales (offline-first) */
export async function initDatabase(): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS routes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      difficulty TEXT NOT NULL DEFAULT 'easy',
      distance_meters REAL NOT NULL DEFAULT 0,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      elevation_gain_meters REAL NOT NULL DEFAULT 0,
      elevation_loss_meters REAL NOT NULL DEFAULT 0,
      max_elevation_meters REAL NOT NULL DEFAULT 0,
      avg_speed_kmh REAL NOT NULL DEFAULT 0,
      max_speed_kmh REAL NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      is_public INTEGER NOT NULL DEFAULT 0,
      is_synced INTEGER NOT NULL DEFAULT 0,
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
      image_uris TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_routes_user_id ON routes(user_id);
    CREATE INDEX IF NOT EXISTS idx_gps_points_route_id ON gps_points(route_id);
    CREATE INDEX IF NOT EXISTS idx_waypoints_route_id ON waypoints(route_id);
  `);
}
