/**
 * Nombres de las tablas y bucket de Ñan Kamay en Supabase.
 *
 * La base de datos es COMPARTIDA con otra plataforma (comunidad de trekking)
 * que ya tiene tablas `routes`, `waypoints`, `profiles`, etc. con un modelo
 * distinto. Para convivir sin colisionar, Ñan Kamay usa el prefijo `nk_`.
 *
 * ⚠️ Solo aplica al lado remoto (Supabase). El SQLite local mantiene los
 * nombres sin prefijo (`routes`, `gps_points`, `waypoints`) — es un archivo
 * local independiente, sin colisión.
 */
export const NK_TABLES = {
  routes: 'nk_routes',
  gpsPoints: 'nk_gps_points',
  waypoints: 'nk_waypoints',
  waypointImages: 'nk_waypoint_images',
  /** Media unificada de waypoints (fotos, videos, notas de voz). */
  waypointMedia: 'nk_waypoint_media',
} as const;

/** Bucket de Storage para imágenes de waypoints (prefijo para no colisionar). */
export const NK_BUCKET = 'nk-waypoint-images';
/** Bucket de Storage para media de waypoints (fotos, video, audio). */
export const NK_MEDIA_BUCKET = 'nk-waypoint-media';
