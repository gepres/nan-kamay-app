-- ============================================================
-- Ñan Kamay — Supabase Schema
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- ── Rutas ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.routes (
  id                    UUID PRIMARY KEY,
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  description           TEXT,
  difficulty            TEXT NOT NULL DEFAULT 'easy'
                          CHECK (difficulty IN ('easy', 'moderate', 'hard')),
  distance_meters       FLOAT NOT NULL DEFAULT 0,
  duration_seconds      INT   NOT NULL DEFAULT 0,
  elevation_gain_meters FLOAT NOT NULL DEFAULT 0,
  elevation_loss_meters FLOAT NOT NULL DEFAULT 0,
  max_elevation_meters  FLOAT NOT NULL DEFAULT 0,
  avg_speed_kmh         FLOAT NOT NULL DEFAULT 0,
  max_speed_kmh         FLOAT NOT NULL DEFAULT 0,
  started_at            TIMESTAMPTZ NOT NULL,
  finished_at           TIMESTAMPTZ,
  is_public             BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Puntos GPS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gps_points (
  id             UUID PRIMARY KEY,
  route_id       UUID NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  latitude       FLOAT NOT NULL,
  longitude      FLOAT NOT NULL,
  altitude       FLOAT,
  accuracy       FLOAT,
  speed          FLOAT,
  recorded_at    TIMESTAMPTZ NOT NULL,
  sequence_index INT NOT NULL
);

-- ── Waypoints ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.waypoints (
  id          UUID PRIMARY KEY,
  route_id    UUID NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  latitude    FLOAT NOT NULL,
  longitude   FLOAT NOT NULL,
  altitude    FLOAT,
  title       TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Imágenes de waypoints ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.waypoint_images (
  id           UUID PRIMARY KEY,
  waypoint_id  UUID NOT NULL REFERENCES public.waypoints(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Índices ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_routes_user_id     ON public.routes(user_id);
CREATE INDEX IF NOT EXISTS idx_routes_is_public   ON public.routes(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_gps_points_route   ON public.gps_points(route_id, sequence_index);
CREATE INDEX IF NOT EXISTS idx_waypoints_route    ON public.waypoints(route_id);
CREATE INDEX IF NOT EXISTS idx_wp_images_waypoint ON public.waypoint_images(waypoint_id);

-- ── Row Level Security (RLS) ──────────────────────────────────
ALTER TABLE public.routes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gps_points     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waypoints      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waypoint_images ENABLE ROW LEVEL SECURITY;

-- routes: el usuario solo ve y edita sus propias rutas (+ rutas públicas de otros)
CREATE POLICY "routes_select" ON public.routes FOR SELECT
  USING (user_id = auth.uid() OR is_public = true);

CREATE POLICY "routes_insert" ON public.routes FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "routes_update" ON public.routes FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "routes_delete" ON public.routes FOR DELETE
  USING (user_id = auth.uid());

-- gps_points: acceso via route ownership
CREATE POLICY "gps_points_select" ON public.gps_points FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.routes r
    WHERE r.id = route_id AND (r.user_id = auth.uid() OR r.is_public = true)
  ));

CREATE POLICY "gps_points_insert" ON public.gps_points FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.routes r WHERE r.id = route_id AND r.user_id = auth.uid()
  ));

CREATE POLICY "gps_points_delete" ON public.gps_points FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.routes r WHERE r.id = route_id AND r.user_id = auth.uid()
  ));

-- waypoints: mismo patrón
CREATE POLICY "waypoints_select" ON public.waypoints FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.routes r
    WHERE r.id = route_id AND (r.user_id = auth.uid() OR r.is_public = true)
  ));

CREATE POLICY "waypoints_insert" ON public.waypoints FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.routes r WHERE r.id = route_id AND r.user_id = auth.uid()
  ));

CREATE POLICY "waypoints_delete" ON public.waypoints FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.routes r WHERE r.id = route_id AND r.user_id = auth.uid()
  ));

-- waypoint_images
CREATE POLICY "wp_images_select" ON public.waypoint_images FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.waypoints wp
    JOIN public.routes r ON r.id = wp.route_id
    WHERE wp.id = waypoint_id AND (r.user_id = auth.uid() OR r.is_public = true)
  ));

CREATE POLICY "wp_images_insert" ON public.waypoint_images FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.waypoints wp
    JOIN public.routes r ON r.id = wp.route_id
    WHERE wp.id = waypoint_id AND r.user_id = auth.uid()
  ));

CREATE POLICY "wp_images_delete" ON public.waypoint_images FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.waypoints wp
    JOIN public.routes r ON r.id = wp.route_id
    WHERE wp.id = waypoint_id AND r.user_id = auth.uid()
  ));

-- ── Storage bucket para imágenes ─────────────────────────────
-- Crear en: Supabase Dashboard → Storage → New bucket
-- Nombre: waypoint-images  |  Public: true
INSERT INTO storage.buckets (id, name, public)
VALUES ('waypoint-images', 'waypoint-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "storage_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'waypoint-images');

CREATE POLICY "storage_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'waypoint-images' AND auth.uid() IS NOT NULL);

CREATE POLICY "storage_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'waypoint-images' AND (storage.foldername(name))[1] = auth.uid()::text);
