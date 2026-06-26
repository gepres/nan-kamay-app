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
  -- Si la ruta fue grabada "siguiendo" otra (feature Seguir Ruta), guarda
  -- la referencia al padre. SET NULL al borrar el padre: la ruta nueva
  -- conserva sus datos pero pierde la asociación.
  parent_route_id       UUID REFERENCES public.nk_routes(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migración idempotente para bases ya creadas
ALTER TABLE public.nk_routes
  ADD COLUMN IF NOT EXISTS parent_route_id UUID
  REFERENCES public.nk_routes(id) ON DELETE SET NULL;

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

-- ── Imágenes de waypoints (LEGACY: fotos antiguas) ────────────
CREATE TABLE IF NOT EXISTS public.nk_waypoint_images (
  id           UUID PRIMARY KEY,
  waypoint_id  UUID NOT NULL REFERENCES public.nk_waypoints(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Media de waypoints (fotos, videos, notas de voz) ──────────
CREATE TABLE IF NOT EXISTS public.nk_waypoint_media (
  id             UUID PRIMARY KEY,
  waypoint_id    UUID NOT NULL REFERENCES public.nk_waypoints(id) ON DELETE CASCADE,
  type           TEXT NOT NULL CHECK (type IN ('image','video','audio')),
  storage_path   TEXT NOT NULL,
  thumbnail_path TEXT,
  duration_ms    INTEGER,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Índices (nombres prefijados para unicidad global) ─────────
CREATE INDEX IF NOT EXISTS idx_nk_routes_user_id   ON public.nk_routes(user_id);
CREATE INDEX IF NOT EXISTS idx_nk_routes_is_public ON public.nk_routes(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_nk_routes_parent    ON public.nk_routes(parent_route_id) WHERE parent_route_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nk_gps_points_route ON public.nk_gps_points(route_id, sequence_index);
CREATE INDEX IF NOT EXISTS idx_nk_waypoints_route  ON public.nk_waypoints(route_id);
CREATE INDEX IF NOT EXISTS idx_nk_wp_images_wp     ON public.nk_waypoint_images(waypoint_id);
CREATE INDEX IF NOT EXISTS idx_nk_wp_media_wp      ON public.nk_waypoint_media(waypoint_id);

-- ── Row Level Security (RLS) ──────────────────────────────────
ALTER TABLE public.nk_routes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nk_gps_points      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nk_waypoints       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nk_waypoint_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nk_waypoint_media  ENABLE ROW LEVEL SECURITY;

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

-- nk_waypoint_media (mismo patrón vía ownership de la ruta del waypoint)
DROP POLICY IF EXISTS "nk_wp_media_select" ON public.nk_waypoint_media;
CREATE POLICY "nk_wp_media_select" ON public.nk_waypoint_media FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.nk_waypoints wp
    JOIN public.nk_routes r ON r.id = wp.route_id
    WHERE wp.id = waypoint_id AND (r.user_id = auth.uid() OR r.is_public = true)
  ));

DROP POLICY IF EXISTS "nk_wp_media_insert" ON public.nk_waypoint_media;
CREATE POLICY "nk_wp_media_insert" ON public.nk_waypoint_media FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.nk_waypoints wp
    JOIN public.nk_routes r ON r.id = wp.route_id
    WHERE wp.id = waypoint_id AND r.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "nk_wp_media_update" ON public.nk_waypoint_media;
CREATE POLICY "nk_wp_media_update" ON public.nk_waypoint_media FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.nk_waypoints wp
    JOIN public.nk_routes r ON r.id = wp.route_id
    WHERE wp.id = waypoint_id AND r.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "nk_wp_media_delete" ON public.nk_waypoint_media;
CREATE POLICY "nk_wp_media_delete" ON public.nk_waypoint_media FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.nk_waypoints wp
    JOIN public.nk_routes r ON r.id = wp.route_id
    WHERE wp.id = waypoint_id AND r.user_id = auth.uid()
  ));

-- ── Sesiones de seguimiento en vivo (link "sígueme") ─────────
-- Una fila por sesión; guarda la ÚLTIMA posición (se actualiza in-place, sin
-- historial). El emisor (dueño) escribe; el visor lee SOLO vía la función
-- nk_get_live_session(token) de abajo (SECURITY DEFINER), presentando el token
-- de capacidad que recibió por SMS. `route_id` NO es FK: al grabar, la ruta es
-- un borrador local que aún no existe en nk_routes.
CREATE TABLE IF NOT EXISTS public.nk_live_sessions (
  id              UUID PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token           TEXT NOT NULL UNIQUE,
  route_id        UUID,
  owner_name      TEXT,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
  last_lat        DOUBLE PRECISION,
  last_lon        DOUBLE PRECISION,
  last_altitude   DOUBLE PRECISION,
  last_accuracy   DOUBLE PRECISION,
  last_speed      DOUBLE PRECISION,
  last_at         TIMESTAMPTZ,
  distance_meters FLOAT NOT NULL DEFAULT 0,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at        TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nk_live_sessions_token ON public.nk_live_sessions(token);
CREATE INDEX IF NOT EXISTS idx_nk_live_sessions_user  ON public.nk_live_sessions(user_id);

ALTER TABLE public.nk_live_sessions ENABLE ROW LEVEL SECURITY;

-- Solo el dueño ve/escribe su sesión. El visor NO usa estas policies: entra por
-- la función SECURITY DEFINER de abajo (con el token). Así nadie autenticado
-- puede enumerar las ubicaciones en vivo de los demás.
DROP POLICY IF EXISTS "nk_live_sessions_select" ON public.nk_live_sessions;
CREATE POLICY "nk_live_sessions_select" ON public.nk_live_sessions FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "nk_live_sessions_insert" ON public.nk_live_sessions;
CREATE POLICY "nk_live_sessions_insert" ON public.nk_live_sessions FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "nk_live_sessions_update" ON public.nk_live_sessions;
CREATE POLICY "nk_live_sessions_update" ON public.nk_live_sessions FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "nk_live_sessions_delete" ON public.nk_live_sessions;
CREATE POLICY "nk_live_sessions_delete" ON public.nk_live_sessions FOR DELETE
  USING (user_id = auth.uid());

-- Lectura del visor: presenta el token; devuelve solo la posición en vivo (sin
-- user_id ni token) y solo si la sesión no expiró. SECURITY DEFINER salta RLS,
-- pero el filtro por token EXACTO evita enumeración. Concedida solo a usuarios
-- autenticados (el visor es la misma app, con sesión iniciada).
CREATE OR REPLACE FUNCTION public.nk_get_live_session(p_token text)
RETURNS TABLE (
  owner_name      text,
  status          text,
  last_lat        double precision,
  last_lon        double precision,
  last_altitude   double precision,
  last_accuracy   double precision,
  last_speed      double precision,
  last_at         timestamptz,
  distance_meters double precision,
  started_at      timestamptz,
  ended_at        timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT owner_name, status, last_lat, last_lon, last_altitude, last_accuracy,
         last_speed, last_at, distance_meters, started_at, ended_at
  FROM public.nk_live_sessions
  WHERE token = p_token AND expires_at > now()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.nk_get_live_session(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nk_get_live_session(text) TO authenticated;

-- TTL forzado en el servidor: el cliente NO controla expires_at/created_at (ni
-- puede reasignar dueño o token). Sin esto, un cliente modificado podría fijar
-- un expires_at lejano y volver el token (capacidad) casi permanente, rompiendo
-- la revocación por expiración. El token vive 12 h desde su creación.
CREATE OR REPLACE FUNCTION public.nk_live_sessions_enforce_ttl()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    NEW.created_at := now();
    NEW.expires_at := now() + INTERVAL '12 hours';
  ELSE  -- UPDATE: estos campos son inmutables desde el cliente
    NEW.created_at := OLD.created_at;
    NEW.expires_at := OLD.expires_at;
    NEW.user_id    := OLD.user_id;
    NEW.token      := OLD.token;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_nk_live_sessions_ttl ON public.nk_live_sessions;
CREATE TRIGGER trg_nk_live_sessions_ttl
  BEFORE INSERT OR UPDATE ON public.nk_live_sessions
  FOR EACH ROW EXECUTE FUNCTION public.nk_live_sessions_enforce_ttl();

-- Limpieza de filas viejas (privacidad). La RPC ya oculta las expiradas y
-- startLiveShare borra las propias vencidas al crear una nueva sesión. Para un
-- purgado total, habilita pg_cron (Dashboard → Database → Extensions) y descomenta:
-- SELECT cron.schedule('purge_nk_live_sessions', '0 3 * * *',
--   $$DELETE FROM public.nk_live_sessions WHERE expires_at < now() - INTERVAL '7 days'$$);

-- ── Storage bucket para imágenes (LEGACY) ─────────────────────
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

-- ── Storage bucket para media (fotos, video, audio) ───────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('nk-waypoint-media', 'nk-waypoint-media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "nk_media_storage_select" ON storage.objects;
CREATE POLICY "nk_media_storage_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'nk-waypoint-media');

DROP POLICY IF EXISTS "nk_media_storage_insert" ON storage.objects;
CREATE POLICY "nk_media_storage_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'nk-waypoint-media' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "nk_media_storage_update" ON storage.objects;
CREATE POLICY "nk_media_storage_update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'nk-waypoint-media' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "nk_media_storage_delete" ON storage.objects;
CREATE POLICY "nk_media_storage_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'nk-waypoint-media' AND (storage.foldername(name))[1] = auth.uid()::text);
