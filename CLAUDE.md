# Ñan Kamay — Guía del Proyecto para Claude

> "Ñan Kamay" (Quechua: "el camino de la mano") — App React Native para grabación de rutas de sendero y montaña.

> **Esta guía fue corregida (2026-05-17) para reflejar el código real.** Las versiones anteriores listaban archivos que no existen. Para el estado de cada flujo y los bugs verificados, ver **[`docs/VALIDATION.md`](./docs/VALIDATION.md)**. Para los flujos con diagramas, **[`docs/FLOWS.md`](./docs/FLOWS.md)**. Arquitectura honesta en **[`ARCHITECTURE.md`](./ARCHITECTURE.md)**.

---

## Estado real (actualizado 2026-06-26)

**Base de datos COMPARTIDA** con otra plataforma de comunidad de trekking. Ñan Kamay convive con prefijo `nk_` (`nk_routes`, `nk_gps_points`, `nk_waypoints`, `nk_waypoint_images`) y comparte `auth.users`. Nombres centralizados en `src/infrastructure/supabase/tables.ts`. SQLite local mantiene nombres sin prefijo.

| Flujo | Estado |
|-------|--------|
| Grabación GPS + guardado local SQLite | ✅ Funcional |
| Exportación GPX/KML/KMZ | ✅ Funcional |
| **Sincronización a Supabase** | ✅ Corregida: UUID v4 (`@shared/utils/uuid`), 5 dificultades, RLS con UPDATE, tablas `nk_`. Requiere aplicar `supabase/schema.sql` |
| Persistencia de `activityType` y tipo de waypoint | ✅ Corregida (mappers + columnas SQLite/Supabase + migración) |
| `ON DELETE CASCADE` local | ✅ `PRAGMA foreign_keys = ON` añadido |
| Stop GPS al finalizar (A2) | ✅ Corregido (`active.tsx` detiene GPS antes de navegar) |
| Guard de auth reactivo en `(tabs)` (A4) | ✅ Corregido (`(tabs)/_layout.tsx` redirige si no hay user) |
| Errores de sync visibles al usuario (M10) | ✅ Corregido (toasts con `result.errors`) |
| Persistencia incremental + recuperación (A3) | ✅ Corregido (borrador `is_draft`, persistencia incremental, background direct-write, diálogo de recuperación) |
| Login Google OAuth (A5) | ✅ Corregido (`expo-web-browser` + PKCE; requiere config Supabase/Google + rebuild) |
| Sync bidireccional / imágenes idempotentes (A6/A8) | ✅ Corregido (pull + delete remoto; imágenes delete+insert sin re-subir) |
| 🟡 lote final (M16 minElev, M12 recientes, M14 aviso tiles, M17 perfil, A6-ext borrado cross-device + Storage) | ✅ Corregido |
| GPS — calidad de grabación | ✅ Hecho: One Euro (`OneEuroFilter`), anti-serpenteo RDP (`geometry.simplifyLngLat`), orden timestamps background (`GpsServiceImpl`), **precalentado + gate de señal** y **siembra del filtro** en pre-grabación, **radio anti-deriva por precisión**. Protocolo: `docs/GPS_FIELD_TESTS.md`; análisis: `docs/GPS_RECORDING_REVIEW.md` |
| Strava **Fase 1** (analítica) + **Fase 2** (grabación pro: parciales/auto-pausa/audio) | ✅ Hecho. Pantallas `/metrics/progress`, `/metrics/places`; perfil con récords/heatmap/recap; `computeMetrics`/`computeSplits`/`computeZones` |
| Strava **Fase 3** (mapas offline) + **Fase 4** (planificador) | ✅ Validado en dispositivo (2026-06-26). Offline **PMTiles** (Protomaps/OSM): `OfflineMapsService` + `/map-offline` didáctico (buscador/preview/sugeridas, **8 regiones**); planificador con persistencia (`is_planned`, `routes/planned`). Licencia Thunderforest **ya no aplica** al offline |
| **Editor de trazado post-grabación + CRUD de waypoint** | ✅ Hecho (2026-06-26). `routes/refine` (recortar/quitar/suavizar/redibujar/mover + asistente de limpieza/cerrar lazo/pegar a OSM); agregar/editar/borrar waypoint; guía visual al reubicar. Repo: `replaceGpsPoints`/`updateRouteStats`/`deleteWaypoint` |
| Diagnóstico de mapas offline in-app | ✅ Hecho (2026-06-26). `shared/utils/mapLogger` (buffer de logs MapLibre, funciona en release) en el botón 🐞 de `/map-offline`, con **Copiar** (`expo-clipboard`) |

**Antes de tocar sync, backend o esquema:** lee `docs/VALIDATION.md`.
**Antes de planear/seguir features tipo Strava:** lee `docs/STRAVA_ROADMAP.md` (incluye §"Pendientes por implementar").

---

## Descripción del Proyecto

Aplicación móvil para registrar rutas de trekking/senderismo con GPS, funcional online y offline. Los usuarios graban su recorrido, añaden waypoints con multimedia, ven estadísticas al finalizar y exportan la ruta en formatos estándar.

---

## Stack Tecnológico

| Capa | Tecnología |
|------|------------|
| Framework | **Expo SDK 55** (React Native 0.83) + TypeScript |
| Routing | **Expo Router** (file-based, root = `src/app`) |
| Estilos | **NativeWind** (TailwindCSS v4) |
| Estado Global | **Zustand** |
| Base de Datos | **Supabase** (PostgreSQL) + **expo-sqlite** local |
| Autenticación | **Supabase Auth** (email; Google OAuth no operativo) |
| Mapas | **MapLibre GL** (`@maplibre/maplibre-react-native` v10) + **Thunderforest** (9 estilos, online) + **PMTiles** offline (Protomaps/OSM, ODbL) |
| GPS | **expo-location** (foreground + background via TaskManager) |
| Notificaciones | **expo-notifications** (persistente con stats en vivo) |
| Storage Seguro | **expo-secure-store** (tokens, vía adapter de Supabase) |
| Storage Rápido | **react-native-mmkv** |
| Imágenes | **expo-image-picker** + **expo-file-system** |
| Iconos | **lucide-react-native** + **@expo/vector-icons** (Ionicons) |
| Exportación | GPX, KML, KMZ (JSZip), manual |
| Animaciones | **react-native-reanimated** |

---

## Diseño

- **Archivo Pencil**: `pencil/trek-kamay.pen` (acceder solo vía herramientas MCP `pencil`).
- **Tema**: Dark mode, verde bosque + accent ámbar. Fuente: Inter (UI), Sora (títulos).

### Design Tokens (`src/presentation/theme/colors.ts`)
| Variable | Hex | Uso |
|----------|-----|-----|
| `accent` | `#F59E0B` | Ámbar — acción principal |
| `accentSoft` | `#F59E0B30` | Ámbar transparente |
| `bgPrimary` | `#0D1B12` | Fondo principal |
| `bgCard` | `#1B4332` | Fondo tarjetas |
| `bgElevated` | `#2D6A4F` | Fondo elevado |
| `bgInput` | `#14291D` | Fondo inputs |
| `textPrimary` | `#FFFFFF` | Texto principal |
| `textSecondary` | `#A7C4B5` | Texto secundario |
| `textMuted` | `#6B8F7B` | Texto apagado |
| `border` | `#2D6A4F` | Bordes |
| `easy` | `#22C55E` | Dificultad fácil |
| `medium` | `#F59E0B` | Dificultad media |
| `hard` | `#EF4444` | Dificultad difícil |
| `veryHard` | `#DC2626` | Muy difícil |
| `expert` | `#991B1B` | Solo expertos |
| `success` | `#22C55E` | Éxito |
| `danger` | `#EF4444` | Peligro / error |

### Pantallas diseñadas (Pencil)
Home · Pre-recording · Active Tracking · Add Waypoint · Waypoint Type Selector · Layer Selector · Route Summary · Route Detail · Login · Register.

### Componentes (estado real)
El diseño Pencil define `Button/Primary`, `Button/Secondary`, `Badge`, `Input`, `Chip`, `RouteCard`, `TabBar`. **En código solo existen `RouteCard` y `TabBar`** como componentes reutilizables; Button/Input/Badge/Chip **no se materializaron** — sus estilos están inline-duplicados en cada pantalla.

---

## Arquitectura

Clean Architecture / Hexagonal **declarada**, pero el código la viola sistemáticamente (auth llama `supabase` directo, use-cases acoplados a singletons, sin contenedor DI). Ver `ARCHITECTURE.md` para el mapa honesto.

### Estructura de carpetas (verificada)

```
index.ts                       # Entry point: importa GpsServiceImpl (TaskManager) ANTES de expo-router/entry
app.json · eas.json
supabase/schema.sql            # ⚠️ Esquema Postgres en la RAÍZ (NO en src/infrastructure/supabase/)
src/
├── app/
│   ├── _layout.tsx            # Root: auth listener Supabase, deep links, initDatabase
│   ├── index.tsx              # Redirect según authStore
│   ├── (auth)/                # _layout, login, register
│   ├── (tabs)/                # _layout, index (Home), explore, profile
│   ├── tracking/              # pre-recording, active, waypoint, waypoint-types, summary
│   └── routes/[id].tsx
│
├── core/
│   ├── entities/              # User, Route, Waypoint, GpsPoint
│   ├── value-objects/         # Coordinates, Difficulty   (SOLO estos 2)
│   ├── errors/                # DomainError, AuthError, GpsError   (AuthError/GpsError sin uso)
│   ├── ports/
│   │   ├── repositories/      # IAuthRepository (huérfano, sin impl), IRouteRepository
│   │   └── services/          # IGpsService, IExportService
│   └── rules/                 # StatsCalculator   (SOLO este)
│
├── application/               # Use-cases como FUNCIONES (no clases)
│   ├── routes/                # GetRoutes, GetPublicRoutes, DeleteRoute, SyncOfflineRoutes
│   ├── tracking/              # SaveRouteUseCase
│   └── export/                # ExportRouteUseCase
│
├── infrastructure/
│   ├── supabase/              # supabaseClient.ts + dtos/
│   ├── repositories/          # RouteRepositoryImpl   (SOLO este)
│   ├── services/              # GpsServiceImpl, GpsFilter, KalmanFilter1D,
│   │                          #   SyncServiceImpl, ImageUploadService, ExportServiceImpl
│   ├── mappers/               # RouteMapper, WaypointMapper, GpsPointMapper
│   ├── database/              # sqliteDb.ts   (NO existe migrations/)
│   └── config/                # env.ts
│
├── presentation/
│   ├── components/
│   │   ├── ui/                # ToastContainer, OfflineBanner, TabBar, WaypointIcon
│   │   ├── map/               # TrackingMap, RouteMap, LayerSelectorModal
│   │   ├── tracking/          # GpsIndicator
│   │   └── routes/            # RouteCard, ElevationChart, ExportButtons
│   ├── hooks/                 # useTracking, useElapsedTime, useNetworkStatus
│   ├── stores/                # authStore, trackingStore, routesStore, uiStore
│   └── theme/                 # colors.ts
│
└── shared/
    ├── utils/                 # formatters.ts, waypointSelection.ts
    └── constants/             # waypointTypes.ts, mapLayers.ts
```

**NO existen** (a pesar de menciones previas): value-objects `Distance/Duration/Speed/Elevation`; `errors/SyncError.ts`; ports `IWaypointRepository/IStorageService/ISyncService`; `rules/RouteRules.ts`; `application/auth/*`; `GetRouteDetailUseCase`; `AuthRepositoryImpl`; `WaypointRepositoryImpl`; `hooks/useAuth.ts`; `hooks/useRoutes.ts`; `components/ui/Button|Input|Badge|Chip`; `shared/types/` (sin `Result`/`AsyncState`); `shared/utils/logger.ts`; `infrastructure/database/migrations/`.

---

## Esquema de Base de Datos

### SQLite local (`src/infrastructure/database/sqliteDb.ts`) — fuente de verdad offline
Tablas `routes`, `gps_points`, `waypoints` con `id TEXT` (UUID v4 como string). Columnas `routes.activity_type`, `routes.is_draft` (grabación en curso), `waypoints.type`. `PRAGMA journal_mode = WAL` + `PRAGMA foreign_keys = ON`. `runMigrations()` aplica `ALTER TABLE ADD COLUMN` idempotente para DBs locales anteriores. Una ruta es borrador (`is_draft=1`) mientras se graba; se persiste incrementalmente y se finaliza (`is_draft=0`) al guardar. Drafts excluidos de `getAll`/`getUnsyncedRoutes`.

### Supabase (`supabase/schema.sql`) — backend remoto, push-only, tablas `nk_`
```sql
nk_routes (id UUID PK, user_id UUID FK auth.users, name, description, activity_type,
        difficulty CHECK ('easy','moderate','hard','very_hard','expert'),
        distance_meters, duration_seconds, elevation_*, avg/max_speed_kmh,
        started_at, finished_at, is_public, created_at)
nk_gps_points (id UUID PK, route_id UUID FK nk_routes, lat, lon, altitude, accuracy, speed, recorded_at, sequence_index)
nk_waypoints (id UUID PK, route_id UUID FK nk_routes, lat, lon, altitude, title, description, type, created_at)
nk_waypoint_images (id UUID PK, waypoint_id UUID FK nk_waypoints, storage_path, created_at)
```
- IDs ahora **UUID v4** reales (`@shared/utils/uuid`) → compatibles con columnas `uuid`.
- `CHECK` de dificultad con los **5 valores**.
- RLS con políticas `SELECT/INSERT/UPDATE/DELETE` (UPDATE permite re-sync vía upsert).
- Script **idempotente** (`DROP POLICY IF EXISTS`, `CREATE TABLE IF NOT EXISTS`); no toca tablas de la otra plataforma. Bucket Storage: `nk-waypoint-images`.

---

## Variables de Entorno (.env)

```env
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=    # el código lee ESTE nombre; acepta anon JWT o publishable key (sb_publishable_...)
EXPO_PUBLIC_THUNDERFOREST_API_KEY=
```
> `env.ts` lee `process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY`. NO uses `EXPO_PUBLIC_SUPABASE_KEY` (el código lo ignoraría). `.env` está en `.gitignore`.

---

## Entry Point y Background Tasks

**El entry point es `index.ts`** (NO `expo-router/entry` directo). `package.json` → `"main": "./index.ts"`.

```
index.ts → import GpsServiceImpl (registra TaskManager.defineTask) → import expo-router/entry
```

Garantiza que `BACKGROUND_LOCATION_TASK` esté registrado antes de que cualquier pantalla lo use. Si `expo prebuild --clean` regenera `index.ts`/`App.tsx`, restaurar nuestro `index.ts` y eliminar `App.tsx`.

---

## GPS y Background Tracking

### Pipeline de filtrado (`GpsFilter.ts`) — 5 etapas en serie
1. **Precision Gate** — descarta `accuracy > 25 m`
2. **Detección estacionaria** — 3 lecturas `< 0.5 m/s` → ancla posición
3. **Kalman 1D** (`KalmanFilter1D.ts`) — suaviza lat/lon (alt si `altitudeAccuracy ≤ 50`)
4. **Desplazamiento mínimo** — ignora `< 8 m`
5. **Anti-teleport** — rechaza `> 15 km/h`

### Foreground
`Location.watchPositionAsync` con `Accuracy.BestForNavigation`, `distanceInterval: 10m`, `timeInterval: 5000ms`.

### Background
`Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, ...)` via TaskManager, **sin `foregroundService` de expo-location** (crash Android 12+). Notificación persistente propia via `expo-notifications` (canal `tracking`, importancia LOW), actualizada cada 5 s desde `useTracking.ts`.

> ✅ **Persistencia incremental (A3).** La ruta se crea como borrador en SQLite (`routes.is_draft = 1`) al iniciar; cada punto/waypoint se persiste según llega (`DraftRouteUseCase`). Si el SO mata el proceso, el `BACKGROUND_LOCATION_TASK` escribe **directo a SQLite** (gate de precisión + desplazamiento, sin Kalman: tramo headless algo más ruidoso pero no se pierde). Al reabrir, Home ofrece **Reanudar / Finalizar / Descartar**. El GPS se detiene explícitamente al finalizar (A2). Ver `docs/VALIDATION.md`.

### Permisos (app.json)
- Android: `ACCESS_FINE/COARSE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, `POST_NOTIFICATIONS`, `CAMERA`, etc.
- iOS: `UIBackgroundModes: ["location"]`, permisos de ubicación/cámara/galería.

---

## Mapa y Capas

### TrackingMap (`src/presentation/components/map/TrackingMap.tsx`)
- `forwardRef` con `TrackingMapHandle` (zoomIn, zoomOut, resetNorth).
- `Camera` usa `defaultSettings` (evita reset de zoom por render).
- `onRegionDidChange` sincroniza `currentZoom`/`currentHeading`.
- `RasterSource` con `key` dinámico por capa para forzar recarga de tiles.
- ⚠️ Los fallos de carga de tiles están **silenciados** (`Logger.setLogCallback`). Si la API key de Thunderforest falta o el estilo es inválido, la capa "no funciona" sin feedback (explica el "capa (sigue sin funcionar)" de commits recientes). Ver `docs/VALIDATION.md` §M14.

### Capas (`src/shared/constants/mapLayers.ts`)
9 estilos Thunderforest: `outdoors` (default), `landscape`, `cycle`, `transport`, `atlas`, `pioneer`, `neighbourhood`, `mobile-atlas`, `spinal-map`. URLs vía `thunderforestTileUrls(style)` en `env.ts`.

---

## Waypoints

### 50+ tipos en 4 categorías (`src/shared/constants/waypointTypes.ts`)
Geografía y Naturaleza · Construcciones Humanas · Viajes · Otros.

### Flujo de selección de tipo
`waypoint.tsx` muestra tipo actual + recientes; "Ver todos" → `waypoint-types.tsx` (grid con búsqueda). La selección usa `waypointSelection.ts` (estado a nivel de módulo) + `router.back()` + `useFocusEffect` para no perder el formulario.

> ⚠️ **El tipo de waypoint NO se persiste**: `WaypointMapper` no lo mapea y no hay columna `type` en SQLite/Supabase. La feature de 50+ tipos se pierde al guardar. Ver `docs/VALIDATION.md` §C3.

### WaypointIcon (`src/presentation/components/ui/WaypointIcon.tsx`)
Wrapper sobre `lucide-react-native` con `ICON_MAP` (esta lib no exporta un objeto `icons` como `lucide-react`).

---

## Builds y Deployment

### Desarrollo (hot reload)
```bash
npx expo prebuild --clean
npx expo run:android
```

### APK de prueba (EAS Cloud)
```bash
eas build --platform android --profile preview
```
`eas.json`: perfiles `development` (dev client), `preview` y `production` (`buildType: apk`).

### Notas de prebuild
- `expo prebuild --clean` puede regenerar `index.ts`/`App.tsx` — restaurar `index.ts`, eliminar `App.tsx`.
- Cambios en `app.json` (permisos, plugins) requieren rebuild nativo.

---

## Decisiones Técnicas Importantes

1. **Offline-first**: SQLite verdad local; Supabase intento de backup remoto (sync roto hoy).
2. **Background GPS sin `foregroundService` de expo-location**: notificación propia con `expo-notifications`.
3. **Entry point custom** `index.ts`: `TaskManager.defineTask()` antes de Expo Router.
4. **Camera con `defaultSettings`**: props declarativas causarían reset de zoom por render.
5. **RasterSource con `key` dinámico**: MapLibre no recarga tiles si solo cambia `tileUrlTemplates` en el mismo source.
6. **Selección de tipo de waypoint vía estado de módulo**: `router.navigate` crearía nueva instancia y perdería el formulario.
7. **GPX/KML/KMZ manuales**: control total del formato (sin librería).
8. **`lucide-react-native`**: usar `WaypointIcon.tsx` con `ICON_MAP` (no exporta objeto `icons`).
9. **GpsFilter pipeline 5 etapas**: limpieza de ruido GPS en tiempo real.

---

## Convenciones del Proyecto

- Archivos: `PascalCase.tsx` (componentes), `camelCase.ts` (utilidades).
- Imports absolutos: `@core/`, `@application/`, `@infrastructure/`, `@presentation/`, `@shared/` (babel + tsconfig).
- Commits: `feat:`, `fix:`, `refactor:`, `docs:`. Ramas: `feat/...`, `fix/...`.
- Idealmente sin lógica de negocio en componentes (regla violada hoy en `summary.tsx`, `routes/[id].tsx`).
- Todos los textos UI en español.
- Colores: SIEMPRE tokens de `colors.ts`, nunca hex hardcodeado.
- Use-cases son **funciones** (no clases) y lanzan `Error` (no se usa patrón `Result<T>`).
- MapLibre logs silenciados ("Failed to load tile", "permanent error: Canceled") — pero esto **oculta fallos reales de tiles**.

---

## Skills recomendadas para este proyecto

> Skills que Claude debe **preferir** invocar cuando aplique al contexto. Lista curada al stack real (Expo SDK 55 + RN 0.83 + NativeWind 4 + Supabase + MapLibre).

### 🔴 Críticas — usar proactivamente
- **`react-doctor`** — correr tras cualquier cambio en React/RN para detectar deps de hooks, leaks de stores Zustand, re-renders en `TrackingMap`.
- **`building-native-ui`** — referencia para Expo Router file-based (`(auth)`, `(tabs)`, `tracking/`, `routes/[id]`).
- **`expo-dev-client`** — cambios en `app.json` (permisos, plugins, `expo-web-browser`) requieren rebuild del dev client.
- **`expo-deployment`** — perfiles EAS `preview`/`production` ya definidos en `eas.json`.
- **`expo-tailwind-setup`** — NativeWind v4 + Tailwind v4 (combinación específica del proyecto).
- **`native-data-fetching`** — llamadas a Supabase, sync push/pull, offline, `useNetworkStatus`.
- **`upgrading-expo`** — bumps de SDK; estamos en SDK 55 con RN 0.83 / React 19.
- **`supabase-postgres-best-practices`** — esquema `nk_*`, RLS, índices, Storage `nk-waypoint-images`.
- **`verify`** — validar cambios en dispositivo real (no hay tests automatizados; type-check no valida UI/GPS).
- **`security-review`** / **`everything-claude-code:security-review`** — auth (Google OAuth + PKCE + deep links), RLS, tokens en `expo-secure-store`.

### 🟡 Importantes — usar cuando aplique al cambio
- **`design-mobile-apps`** — sólo si se trabaja sobre `pencil/trek-kamay.pen` vía MCP `pencil`.
- **`composition-patterns`** — al extraer `Button/Input/Badge/Chip` (hoy duplicados inline en pantallas).
- **`react-best-practices`** — performance en `TrackingMap` (cámara, `RasterSource` con key dinámica) y stores Zustand.
- **`tailwind-css-patterns`** — patrones responsive/utilitarios en pantallas (`active`, `summary`, `pre-recording`).
- **`typescript-advanced-types`** — tipos de dominio (`Coordinates`, `Difficulty`), mappers SQLite↔Supabase.
- **`accessibility`** — pantallas de tracking y formularios de waypoint con TalkBack/VoiceOver (sin auditar).
- **`everything-claude-code:database-migrations`** — `runMigrations()` SQLite + evolución de `supabase/schema.sql`.
- **`everything-claude-code:postgres-patterns`** — índices, query plans, performance (complementa la de Supabase).
- **`code-review`** — revisión de diff antes de PR (no hay CI con tests).
- **`run`** — launcher para `expo run:android` con dev client.

### 🟢 Futuro — cuando arranquen tests / CI
- **`everything-claude-code:tdd-workflow`** — hoy no hay framework de tests; útil al instalar Jest/RNTL.
- **`everything-claude-code:e2e-testing`** — para flujos críticos (login → grabar → guardar → ver) con Detox/Maestro.
- **`expo-cicd-workflows`** — EAS Workflows YAML para CI/CD de builds.
- **`everything-claude-code:coding-standards`** — refuerza las convenciones TS/React de este archivo.

### ⚪ NO usar (fuera de dominio)
SEO (app móvil, no web), Swift/SwiftUI/Liquid Glass/FoundationModels (Swift nativo), Django/Spring Boot/JPA/Go/C++/Python (otros stacks), frontend-slides/frontend-design (web), content/article/market/investor (no técnicas), ClickHouse/Nutrient/visa-doc-translate (fuera de dominio).

---

## Pendiente real

- [x] **P0**: UUID v4 reales, `schema.sql` con 5 dificultades + `activity_type` + `type` + tablas `nk_`, `PRAGMA foreign_keys = ON`, mappers + migración SQLite, RLS `UPDATE`, `stopTracking()` explícito (A2). **(hecho 2026-05-18)**
- [x] **P1**: guard de auth reactivo (A4), errores de sync visibles (M10), persistencia incremental + recuperación (A3). **(hecho 2026-05-18)**
- [x] **P2**: OAuth Google (A5), sync bidireccional push+pull + borrado remoto (A6), imágenes idempotentes (A8). **(hecho 2026-05-18)**
- [x] **🟡 lote** (2026-05-18): M3 stats incremental O(1), M7 formatters defensivos, M6 XML control-chars/NaN, M5 KMZ imágenes referenciadas+resiliente, M11 limpieza `exports/`, M2 `reset()` completo, M8 `explore` recarga, M4 Kalman no-reset en resume (+ `startTracking` idempotente), M15 quita `useOutdoorTiles`.
- [x] **🟡 final** (2026-05-18): M16 persistir `minElevation`, M12 recientes waypoint (AsyncStorage), M14 aviso de API key de tiles, M17 perfil con stats agregadas, A6-ext borrado cross-device + cleanup Storage.
- [x] **GPS calidad** (2026-06): One Euro, RDP anti-serpenteo, orden timestamps background, precalentado+gate de señal, siembra del filtro, radio anti-deriva por precisión, auto-pausa, audio por km.
- [x] **Strava Fases 1–2** (2026-06): analítica local (progreso/lugares/récords/heatmap/recap) + grabación pro (parciales/auto-pausa/audio).
- [x] **Strava Fases 3–4** (2026-06): mapas offline (**PMTiles** Protomaps/OSM, **validado en dispositivo 2026-06-26**: corregidos negro+glyphs; 8 regiones, pantalla didáctica con buscador) y planificador (persistencia `is_planned` + `routes/planned`).
- [x] **Editor de trazado post-grabación + CRUD de waypoint** (2026-06-26): `routes/refine` (recortar/quitar/suavizar/redibujar/mover + limpieza/cerrar lazo/pegar a OSM) + agregar/editar/borrar waypoint + guía al reubicar; Fase 0 datos/sync (`replaceGpsPoints`/`updateRouteStats`/`deleteWaypoint`).
- [ ] **Pendientes (lista única y ordenada): ver `docs/STRAVA_ROADMAP.md` §"Pendientes por implementar"** — quedan: 🟡 cliente (detalle público con elevación interactiva, *snap* del planner, métricas DEM/nombres de zona), 🟢 backend **Fase 5 (seguridad)** y **Fase 6 (social)**, y validación de campo (GPS reposo, auto-pausa).
- [ ] Deuda arquitectónica (presentación→infra, use-cases no-clase, DI) — **deferida a propósito** (refactor amplio, alto riesgo, sin ganancia funcional). Ver `ARCHITECTURE.md` §6.
- [ ] Testing (no hay framework instalado).

### Config externa requerida (A5 — Google OAuth)
1. Supabase Dashboard → **Auth → Providers → Google**: habilitar con Client ID/Secret de Google Cloud.
2. Supabase Dashboard → **Auth → URL Configuration → Redirect URLs**: añadir `nan-kamay://auth-callback`.
3. Rebuild del dev client (se añadió `expo-web-browser` + plugin en `app.json`).

Detalle y orden: **[`docs/VALIDATION.md`](./docs/VALIDATION.md)**.
