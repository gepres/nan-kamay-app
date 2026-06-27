# Observabilidad — Analítica de uso + Reporte de bug (in-house)

> Dashboard del app **con datos propios y privacidad**, sin Google/Firebase. Eventos →
> tabla `nk_events` en Supabase; reportes de bug → `nk_bug_reports` + bucket privado `nk-bug-shots`.
> **Visualización: panel propio en Astro** (`D:\projects\nan-kamay-dashboard`, ya construido); Metabase
> queda como alternativa. Ver §5.
>
> **Estado (2026-06-26): implementado, schema aplicado y validado en dispositivo.** El panel conecta
> y lee las tablas; pendiente solo que el uso real genere eventos.

---

## 1. Por qué "en casa" y no Google Analytics / Firebase

| Criterio | Firebase/GA4 | En casa (Supabase + Metabase) ✅ |
|----------|--------------|----------------------------------|
| Heatmaps reales | ❌ no los da (eso es UXCam/Clarity) | ❌ tampoco (diferido, ver §7) |
| Reporte de bug in-app | ❌ no | ✅ propio (`nk_bug_reports`) |
| Embudos / flujos más usados | ✅ (con setup) | ✅ SQL libre en Metabase |
| Dueño de los datos | Google | **Tú** (tu Postgres) |
| Dependencia nueva nativa | sí (rebuild) | **no** (todo JS, ya hay Supabase) |
| Privacidad (app de **ubicación**) | datos salen a Google | datos quedan en tu DB |

Como ya existe Supabase, logueamos eventos a tablas propias y los exploramos con Metabase. El
resultado es el dashboard pedido (flujos más usados, bugs, gráficas) **con propiedad total**.

---

## 2. Arquitectura

```
App (cliente)                         Supabase (Postgres)            Dashboard
─────────────                         ───────────────────            ─────────
trackEvent(name, props)
   │  cola en memoria + AsyncStorage
   │  (offline-first, cap 500)
   ▼
flush() por lotes  ───INSERT───►   nk_events  (RLS: INSERT propio)  ◄── Metabase
   gatillos: cola≥20 · 30s ·                                            (rol Postgres
   reconexión · foreground          nk_bug_reports                       SOLO-LECTURA,
                                     nk-bug-shots (bucket privado)        salta RLS)
```

- **Cliente:** `src/infrastructure/services/AnalyticsService.ts` (eventos),
  `src/application/feedback/submitBugReport.ts` + `src/app/report-bug.tsx` (bugs).
- **Backend:** `supabase/schema.sql` §"Observabilidad" (tablas + RLS + bucket). Idempotente. **Aplicado.**
- **Dashboard:** panel Astro propio (`D:\projects\nan-kamay-dashboard`) o Metabase, ambos conectados
  con un rol Postgres de **solo-lectura** `metabase_ro` (no el service role) vía **Session pooler**.

---

## 3. Reglas de privacidad (regla DURA — es app de ubicación)

1. **NUNCA** se loguean coordenadas/GPS, direcciones, ni PII en `props`. `sanitizeProps()` solo
   deja `string | number | boolean`; descarta objetos/arrays. El llamador NO pasa lat/lon.
2. La pantalla se guarda como **patrón de segmento** (`/routes/[id]`), nunca el id concreto
   (lo da `useSegments()` de expo-router en `ScreenViewTracker`).
3. `user_id = auth.uid()` (lo exige la RLS). No se añaden datos personales extra.
4. **Opt-out** en Perfil → "Compartir estadísticas de uso". Al desactivar: `trackEvent` es no-op y
   se vacía la cola pendiente. Persistido en `AsyncStorage` (`nk:analytics-opt-out`). Default **ON**
   (analítica de 1ª parte, sin PII).
5. Sin sesión iniciada **no** se trackea (la RLS de `nk_events` exige `user_id = auth.uid()`).
6. Retención: SQL comentado en `schema.sql` para purgar con `pg_cron` eventos > 12 meses.

> **Verificación rápida:** `grep -rn "trackEvent(" src/` y revisar que ningún `props` lleve
> `latitude/longitude/lat/lon/coords/address`.

---

## 4. Catálogo de eventos

Todos llevan además (columnas dedicadas, no en `props`): `user_id`, `session_id` (1 = un arranque
del app), `screen` (patrón de segmento), `app_version`, `platform`, `created_at`.

| Evento | Dónde se dispara | `props` | Para qué |
|--------|------------------|---------|----------|
| `screen_view` | cada cambio de ruta (`_layout.tsx`) | — | pantallas más usadas, navegación |
| `recording_started` | iniciar grabación (`tracking/pre-recording.tsx`) | `activity`, `following` (bool: seguía una ruta) | uso de grabación; ¿planifican antes? |
| `route_saved` | guardar ruta (`tracking/summary.tsx`) | `activity`, `public` (bool), `km` (entero, **no** traza) | embudo grabar→guardar; % públicas |
| `route_exported` | exportar (`ExportButtons.tsx`) | `format` (gpx/kml/kmz) | formatos preferidos |
| `live_share_started` | compartir en vivo (`tracking/active.tsx`) | — | adopción de live-tracking |
| `offline_map_downloaded` | descargar zona (`map-offline.tsx`) | `region` (id de zona, p. ej. `cusco`) | zonas más descargadas |
| `planned_route_saved` | guardar plan (`routes/plan/index.tsx`) | `points` (nº de puntos, **no** coords) | uso del planificador |
| `safety_share_prepared` | preparar check-in/SOS (`safety/index.tsx`) | `kind` (checkin/sos), `contacts` (count) | uso de seguridad |
| `bug_report_submitted` | enviar bug (`report-bug.tsx`) | `category`, `has_image` (bool) | volumen de bugs por categoría |

> `km` y `points` y `contacts` son **escalares agregados**, no posiciones → no son PII. Si en el
> futuro se añade un evento, mantener esta tabla y el §3 al día.

---

## 5. Dashboard

Dos caminos para visualizar (ambos leen las mismas tablas con un rol de **solo-lectura**):
- **A) Panel propio en Astro** — **ya construido** en `D:\projects\nan-kamay-dashboard` (recomendado;
  gráficas listas con el tema del app). Ver §5.3.
- **B) Metabase** — si prefieres armar preguntas/SQL ad-hoc con UI. Ver §5.4.

### 5.1 Rol Postgres de SOLO-LECTURA (necesario para A y B)

No conectes con el `service_role` ni el owner. En Supabase → **SQL Editor** (re-ejecutable):

```sql
do $$
begin
  if not exists (select from pg_roles where rolname = 'metabase_ro') then
    create role metabase_ro login password 'CAMBIA_ESTA_CLAVE';
  end if;
end $$;

grant usage on schema public to metabase_ro;
grant select on public.nk_events, public.nk_bug_reports to metabase_ro;
-- opcional, para cruzar con rutas (nombres/dificultad):
-- grant select on public.nk_routes to metabase_ro;
```

> El rol **salta la RLS** al hacer `SELECT` (la RLS solo limitaba a la app a INSERTAR lo suyo). Concede
> solo `SELECT`. Cambiar clave: `alter role metabase_ro password 'nueva';`

### 5.2 Cadena de conexión — usa el **Session pooler** (no la directa)

⚠️ La **conexión directa** (`db.<ref>.supabase.co`) suele fallar desde una PC con
`getaddrinfo ENOTFOUND` (hoy es IPv6-only). Usa el **Session pooler** (IPv4).

Supabase → botón **Connect** (arriba) → pestaña **Session pooler**:
```
postgresql://postgres.<ref>:[PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres
```
Cambia **2 cosas**: el usuario `postgres.<ref>` → **`metabase_ro.<ref>`** (el `.<ref>` es obligatorio
en el pooler; sin él da "password authentication failed"), y `[PASSWORD]` por la clave del rol. Usa una
clave **solo alfanumérica** (si lleva `@ : / # ?` rompe la URL). **SSL** siempre ON.

### 5.3 Opción A — Panel Astro propio (recomendado, ya hecho)

Proyecto hermano en `D:\projects\nan-kamay-dashboard` (Astro SSR + Chart.js, tema del app). Muestra
KPIs, usuarios activos/día, pantallas top, embudo grabar→guardar→exportar, tipos de actividad, zonas
offline, adopción de funciones y la tabla de bugs.

```bash
cd D:\projects\nan-kamay-dashboard
copy .env.example .env        # pega tu DATABASE_URL (Session pooler, rol metabase_ro)
npm install
npm run test:db               # valida la conexión e imprime el conteo de filas
npm run dev                   # http://localhost:4321
```
Opcional: protege el panel con Basic Auth (`DASH_USER`/`DASH_PASS` en `.env`). Las consultas ya están
implementadas en `src/lib/queries.ts`; para añadir paneles, edítalo y agrega un `<Chart>` en
`src/pages/index.astro`. Detalle: README del proyecto.

### 5.4 Opción B — Metabase

**Levantar:** Docker `docker run -d -p 3000:3000 --name metabase metabase/metabase` (o Metabase Cloud,
gratis). **Conectar:** Admin → Databases → Add → PostgreSQL, con los datos del §5.2 (host del **pooler**,
user `metabase_ro.<ref>`, SSL ON). Luego arma las preguntas del §6 y agrúpalas en un dashboard.

---

## 6. Consultas de referencia (SQL)

> El panel Astro (§5.3) ya las implementa en `src/lib/queries.ts`. Aquí quedan como referencia y para
> usarlas tal cual en Metabase.

**Pantallas más usadas (últimos 30 días):**
```sql
SELECT screen, count(*) AS vistas
FROM nk_events
WHERE name = 'screen_view' AND created_at > now() - INTERVAL '30 days'
GROUP BY screen ORDER BY vistas DESC;
```

**Usuarios activos por día (DAU):**
```sql
SELECT date_trunc('day', created_at) AS dia, count(DISTINCT user_id) AS usuarios
FROM nk_events
WHERE created_at > now() - INTERVAL '60 days'
GROUP BY 1 ORDER BY 1;
```

**Embudo grabar → guardar → exportar (conteo de usuarios únicos):**
```sql
SELECT name, count(DISTINCT user_id) AS usuarios
FROM nk_events
WHERE name IN ('recording_started','route_saved','route_exported')
GROUP BY name
ORDER BY array_position(ARRAY['recording_started','route_saved','route_exported'], name);
```

**Distribución por tipo de actividad (grabaciones):**
```sql
SELECT props->>'activity' AS actividad, count(*) AS grabaciones
FROM nk_events
WHERE name = 'recording_started'
GROUP BY 1 ORDER BY 2 DESC;
```

**Zonas offline más descargadas:**
```sql
SELECT props->>'region' AS zona, count(*) AS descargas
FROM nk_events
WHERE name = 'offline_map_downloaded'
GROUP BY 1 ORDER BY 2 DESC;
```

**Bugs abiertos por categoría y versión:**
```sql
SELECT app_version, category, count(*) AS abiertos
FROM nk_bug_reports
WHERE status = 'open'
GROUP BY 1, 2 ORDER BY abiertos DESC;
```

**Adopción de funciones nuevas (live share / seguridad):**
```sql
SELECT name, count(*) AS usos, count(DISTINCT user_id) AS usuarios
FROM nk_events
WHERE name IN ('live_share_started','safety_share_prepared','planned_route_saved')
GROUP BY 1;
```

> En Metabase guarda cada consulta como **Question** y agrúpalas en un **Dashboard** ("Uso del app",
> "Bugs", "Funciones"). Programa refresco diario.

### Reportes de bug — ver las capturas
`nk_bug_reports.image_path` guarda la ruta dentro del bucket privado `nk-bug-shots`
(`{userId}/bug_<ts>.jpg`). Para verla: Supabase → **Storage → nk-bug-shots** → navega a la carpeta
del usuario, o genera una **signed URL** desde la consola. (El bucket es privado a propósito: una
captura puede mostrar datos del usuario.)

---

## 7. Fuera de alcance (esta fase) / futuro

- **Heatmaps reales** (mapas de calor de toques/scroll): requieren grabar la pantalla (UXCam,
  Clarity) → riesgo de privacidad en app de ubicación. Se **aproxima** con `screen_view` + conteo de
  eventos por pantalla/acción. Diferido.
- **Auto-captura del bug** (view-shot global / agitar para reportar): v1 adjunta desde galería
  (ahí están los screenshots del sistema). Futuro.
- **Eventos pre-login** (anónimos): hoy sin sesión no se trackea (lo exige la RLS).
- **Crashes automáticos** (Sentry): recomendado como fase aparte; complementa, no reemplaza, esto.

---

## 8. Aplicar — estado

1. ✅ **`supabase/schema.sql` aplicado** (`nk_bug_reports`, `nk_events`, bucket `nk-bug-shots` + RLS).
   Confirmado: el panel conecta y consulta ambas tablas.
2. ✅ **Rol `metabase_ro` creado** (§5.1) y **panel Astro conectado** vía Session pooler (§5.2–5.3).
3. ⏳ **Pendiente: generar datos reales.** Instalar el APK con `AnalyticsService`, iniciar sesión y
   usar la app; los eventos llegan por lotes y aparecen al recargar el panel.
4. ⏳ (Opcional) Retención: activar el `pg_cron` comentado en `schema.sql` para purgar eventos viejos.
