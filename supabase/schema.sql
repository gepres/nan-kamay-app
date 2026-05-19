-- ============================================================
-- Ñan Kamay — Supabase Schema (tablas prefijadas nk_)
-- Ejecutar en: Supabase Dashboard → SQL Editor
--
-- ⚠️ Esta base de datos es COMPARTIDA con otra plataforma de comunidad
-- de trekking (tablas routes/profiles/groups/attendees/... con otro modelo).
-- Ñan Kamay usa el prefijo `nk_` para CONVIVIR sin colisionar.
-- Este script NO crea, altera ni borra ninguna tabla de esa plataforma.
-- Es idempotente: se puede re-ejecutar sin error.
-- Auth (auth.users) se COMPARTE: ambas apps usan el mismo login.
-- ============================================================

-- ── Rutas (track GPS grabado) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nk_routes (
  id                    UUID PRIMARY KEY,
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  description           TEXT,
  activity_type         TEXT,
  difficulty            TEXT NOT NULL DEFAULT 'easy'
                          CHECK (difficulty IN ('easy','moderate','hard','very_hard','expert')),
  distance_meters       FLOAT NOT NULL DEFAULT 0,
  duration_seconds      INT   NOT NULL DEFAULT 0,
  elevation_gain_meters FLOAT NOT NULL DEFAULT 0,
  elevation_loss_meters FLOAT NOT NULL DEFAULT 0,
  max_elevation_meters  FLOAT NOT NULL DEFAULT 0,
  min_elevation_meters  FLOAT NOT NULL DEFAULT 0,
  avg_speed_kmh         FLOAT NOT NULL DEFAULT 0,
  max_speed_kmh         FLOAT NOT NULL DEFAULT 0,
  started_at            TIMESTAMPTZ NOT NULL,
  finished_at           TIMESTAMPTZ,
  is_public             BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Puntos GPS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nk_gps_points (
  id             UUID PRIMARY KEY,
  route_id       UUID NOT NULL REFERENCES public.nk_routes(id) ON DELETE CASCADE,
  latitude       FLOAT NOT NULL,
  longitude      FLOAT NOT NULL,
  altitude       FLOAT,
  accuracy       FLOAT,
  speed          FLOAT,
  recorded_at    TIMESTAMPTZ NOT NULL,
  sequence_index INT NOT NULL
);

-- ── Waypoints ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nk_waypoints (
  id          UUID PRIMARY KEY,
  route_id    UUID NOT NULL REFERENCES public.nk_routes(id) ON DELETE CASCADE,
  latitude    FLOAT NOT NULL,
  longitude   FLOAT NOT NULL,
  altitude    FLOAT,
  title       TEXT NOT NULL,
  description TEXT,
  type        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Imágenes de waypoints ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nk_waypoint_images (
  id           UUID PRIMARY KEY,
  waypoint_id  UUID NOT NULL REFERENCES public.nk_waypoints(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Índices (nombres prefijados para unicidad global) ─────────
CREATE INDEX IF NOT EXISTS idx_nk_routes_user_id   ON public.nk_routes(user_id);
CREATE INDEX IF NOT EXISTS idx_nk_routes_is_public ON public.nk_routes(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_nk_gps_points_route ON public.nk_gps_points(route_id, sequence_index);
CREATE INDEX IF NOT EXISTS idx_nk_waypoints_route  ON public.nk_waypoints(route_id);
CREATE INDEX IF NOT EXISTS idx_nk_wp_images_wp     ON public.nk_waypoint_images(waypoint_id);

-- ── Row Level Security (RLS) ──────────────────────────────────
ALTER TABLE public.nk_routes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nk_gps_points      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nk_waypoints       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nk_waypoint_images ENABLE ROW LEVEL SECURITY;

-- nk_routes: el usuario ve/edita sus rutas (+ rutas públicas de otros)
DROP POLICY IF EXISTS "nk_routes_select" ON public.nk_routes;
CREATE POLICY "nk_routes_select" ON public.nk_routes FOR SELECT
  USING (user_id = auth.uid() OR is_public = true);

DROP POLICY IF EXISTS "nk_routes_insert" ON public.nk_routes;
CREATE POLICY "nk_routes_insert" ON public.nk_routes FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "nk_routes_update" ON public.nk_routes;
CREATE POLICY "nk_routes_update" ON public.nk_routes FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "nk_routes_delete" ON public.nk_routes;
CREATE POLICY "nk_routes_delete" ON public.nk_routes FOR DELETE
  USING (user_id = auth.uid());

-- nk_gps_points: acceso vía ownership de la ruta (incluye UPDATE para re-sync/upsert)
DROP POLICY IF EXISTS "nk_gps_points_select" ON public.nk_gps_points;
CREATE POLICY "nk_gps_points_select" ON public.nk_gps_points FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.nk_routes r
    WHERE r.id = route_id AND (r.user_id = auth.uid() OR r.is_public = true)
  ));

DROP POLICY IF EXISTS "nk_gps_points_insert" ON public.nk_gps_points;
CREATE POLICY "nk_gps_points_insert" ON public.nk_gps_points FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.nk_routes r WHERE r.id = route_id AND r.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "nk_gps_points_update" ON public.nk_gps_points;
CREATE POLICY "nk_gps_points_update" ON public.nk_gps_points FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.nk_routes r WHERE r.id = route_id AND r.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "nk_gps_points_delete" ON public.nk_gps_points;
CREATE POLICY "nk_gps_points_delete" ON public.nk_gps_points FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.nk_routes r WHERE r.id = route_id AND r.user_id = auth.uid()
  ));

-- nk_waypoints: mismo patrón (incluye UPDATE)
DROP POLICY IF EXISTS "nk_waypoints_select" ON public.nk_waypoints;
CREATE POLICY "nk_waypoints_select" ON public.nk_waypoints FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.nk_routes r
    WHERE r.id = route_id AND (r.user_id = auth.uid() OR r.is_public = true)
  ));

DROP POLICY IF EXISTS "nk_waypoints_insert" ON public.nk_waypoints;
CREATE POLICY "nk_waypoints_insert" ON public.nk_waypoints FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.nk_routes r WHERE r.id = route_id AND r.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "nk_waypoints_update" ON public.nk_waypoints;
CREATE POLICY "nk_waypoints_update" ON public.nk_waypoints FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.nk_routes r WHERE r.id = route_id AND r.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "nk_waypoints_delete" ON public.nk_waypoints;
CREATE POLICY "nk_waypoints_delete" ON public.nk_waypoints FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.nk_routes r WHERE r.id = route_id AND r.user_id = auth.uid()
  ));

-- nk_waypoint_images
DROP POLICY IF EXISTS "nk_wp_images_select" ON public.nk_waypoint_images;
CREATE POLICY "nk_wp_images_select" ON public.nk_waypoint_images FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.nk_waypoints wp
    JOIN public.nk_routes r ON r.id = wp.route_id
    WHERE wp.id = waypoint_id AND (r.user_id = auth.uid() OR r.is_public = true)
  ));

DROP POLICY IF EXISTS "nk_wp_images_insert" ON public.nk_waypoint_images;
CREATE POLICY "nk_wp_images_insert" ON public.nk_waypoint_images FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.nk_waypoints wp
    JOIN public.nk_routes r ON r.id = wp.route_id
    WHERE wp.id = waypoint_id AND r.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "nk_wp_images_update" ON public.nk_waypoint_images;
CREATE POLICY "nk_wp_images_update" ON public.nk_waypoint_images FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.nk_waypoints wp
    JOIN public.nk_routes r ON r.id = wp.route_id
    WHERE wp.id = waypoint_id AND r.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "nk_wp_images_delete" ON public.nk_waypoint_images;
CREATE POLICY "nk_wp_images_delete" ON public.nk_waypoint_images FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.nk_waypoints wp
    JOIN public.nk_routes r ON r.id = wp.route_id
    WHERE wp.id = waypoint_id AND r.user_id = auth.uid()
  ));

-- ── Storage bucket para imágenes (nombre prefijado) ───────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('nk-waypoint-images', 'nk-waypoint-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "nk_storage_select" ON storage.objects;
CREATE POLICY "nk_storage_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'nk-waypoint-images');

DROP POLICY IF EXISTS "nk_storage_insert" ON storage.objects;
CREATE POLICY "nk_storage_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'nk-waypoint-images' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "nk_storage_delete" ON storage.objects;
CREATE POLICY "nk_storage_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'nk-waypoint-images' AND (storage.foldername(name))[1] = auth.uid()::text);
