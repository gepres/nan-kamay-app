# Arquitectura — Ñan Kamay

> Mapa **honesto** de la arquitectura: cómo está organizado el código, qué patrón se *pretende* seguir y **dónde no se sigue**. No es una guía aspiracional; describe el código que existe hoy (2026-05-17).

---

## 1. Intención vs. realidad

El proyecto **declara** Clean Architecture + Hexagonal (Ports & Adapters):

```
Presentación → Aplicación → Dominio ← Infraestructura
```

La intención es buena y la estructura de carpetas la refleja. Pero el código **viola el patrón de forma sistemática** (ver §6). Trátalo como una arquitectura *en capas con dominio explícito*, no como hexagonal estricta.

| Capa | Debería conocer | Realidad |
|------|-----------------|----------|
| Dominio (`core/`) | Nada externo | ✅ Limpio (pero anémico, sin validación de invariantes) |
| Aplicación (`application/`) | Solo puertos | ⚠️ Use-cases importan singletons concretos; `GetPublicRoutesUseCase` usa `supabase` directo |
| Infraestructura (`infrastructure/`) | Implementa puertos | ✅ Implementa `IRouteRepository`, `IGpsService`, `IExportService` |
| Presentación (`presentation/`, `app/`) | Aplicación + dominio | ❌ Llama `supabase`, `routeRepository` y use-cases directamente |

No existe contenedor de inyección de dependencias: las dependencias se resuelven importando **singletons de módulo** (`routeRepository`, `gpsService`, `exportService`, `supabase`).

---

## 2. Estructura real de carpetas

Verificada contra el sistema de archivos. Lo que **no existe** está marcado.

```
index.ts                       # Entry point custom: importa GpsServiceImpl (TaskManager) ANTES de expo-router/entry
app.json · eas.json            # Config Expo + permisos / perfiles de build
supabase/schema.sql            # ⚠️ Esquema Postgres en la RAÍZ (no en src/infrastructure/supabase/)

src/
├── app/                       # Expo Router (root = src/app)
│   ├── _layout.tsx            # Root: auth listener Supabase, deep links, initDatabase
│   ├── index.tsx              # Redirect según authStore
│   ├── (auth)/                # _layout, login, register
│   ├── (tabs)/                # _layout, index (Home), explore, profile
│   ├── tracking/              # pre-recording, active, waypoint, waypoint-types, summary
│   └── routes/[id].tsx        # Detalle de ruta guardada
│
├── core/                      # DOMINIO (TypeScript puro)
│   ├── entities/              # User, Route, Waypoint, GpsPoint
│   ├── value-objects/         # Coordinates, Difficulty   ← solo estos 2
│   ├── errors/                # DomainError, AuthError, GpsError   (AuthError/GpsError sin uso real)
│   ├── ports/
│   │   ├── repositories/      # IAuthRepository (huérfano), IRouteRepository
│   │   └── services/          # IGpsService, IExportService
│   └── rules/                 # StatsCalculator   ← solo este
│
├── application/               # CASOS DE USO (funciones, no clases)
│   ├── routes/                # GetRoutes, GetPublicRoutes, DeleteRoute, SyncOfflineRoutes
│   ├── tracking/              # SaveRouteUseCase
│   └── export/                # ExportRouteUseCase
│
├── infrastructure/
│   ├── supabase/              # supabaseClient.ts + dtos/   (schema.sql está en la raíz)
│   ├── repositories/          # RouteRepositoryImpl  ← solo este
│   ├── services/              # GpsServiceImpl, GpsFilter, KalmanFilter1D,
│   │                          #   SyncServiceImpl, ImageUploadService, ExportServiceImpl
│   ├── mappers/               # RouteMapper, WaypointMapper, GpsPointMapper
│   ├── database/              # sqliteDb.ts   (NO existe migrations/)
│   └── config/                # env.ts
│
├── presentation/
│   ├── components/
│   │   ├── ui/                # ToastContainer, OfflineBanner, TabBar, WaypointIcon
│   │   │                      #   ❌ NO existen Button/Input/Badge/Chip
│   │   ├── map/               # TrackingMap, RouteMap, LayerSelectorModal
│   │   ├── tracking/          # GpsIndicator
│   │   └── routes/            # RouteCard, ElevationChart, ExportButtons
│   ├── hooks/                 # useTracking, useElapsedTime, useNetworkStatus
│   │                          #   ❌ NO existen useAuth/useRoutes
│   ├── stores/                # authStore, trackingStore, routesStore, uiStore
│   └── theme/                 # colors.ts
│
└── shared/
    ├── utils/                 # formatters.ts, waypointSelection.ts   (❌ NO existe logger.ts)
    └── constants/             # waypointTypes.ts, mapLayers.ts
                               # ❌ NO existe shared/types/ (sin Result<T> ni AsyncState)
```

---

## 3. Capa de Dominio (`core/`)

- **Entities** (`Route`, `Waypoint`, `GpsPoint`, `User`): clases con constructor privado + `create()` / `fromProps()` / getters + `toProps()`. **Sin validación de invariantes** en `create()`. Los IDs se generan con `` `${Date.now()}-${Math.random()...}` `` — **no son UUID** (causa el fallo de sync, ver `docs/VALIDATION.md` §C1).
- **Value Objects**: solo `Coordinates` (interface + `haversineDistance`, sin validar rangos) y `Difficulty` (union type de 5 niveles + `DifficultyLabel`). No hay `Distance/Duration/Speed/Elevation`.
- **Ports**: `IRouteRepository`, `IGpsService`, `IExportService` están implementados. `IAuthRepository` está **definido pero sin implementación** (huérfano).
- **Rules**: `StatsCalculator.calculate(points, durationSeconds)` — distancia haversine con filtro de micro-segmentos y teleports; elevación con EMA + dead-band. Única fuente de estadísticas (vivas y finales).

---

## 4. Capa de Aplicación (`application/`)

Casos de uso como **funciones** (no clases), p. ej. `saveRouteUseCase(input)`, `getRoutesUseCase(userId)`, `syncOfflineRoutesUseCase(userId)`.

- Lanzan `throw new Error(...)` para errores (no se usa el patrón `Result<T>`).
- **Acoplados a infraestructura**: importan singletons concretos (`routeRepository`, `exportService`) en vez de recibir puertos. `GetPublicRoutesUseCase` importa `supabaseClient` directamente y duplica el mapeo snake_case (no usa `RouteMapper` ni `IRouteRepository`).

---

## 5. Capa de Infraestructura (`infrastructure/`)

### Persistencia — offline-first

- **SQLite** (`database/sqliteDb.ts`) es la fuente de verdad local. Tablas `routes`, `gps_points`, `waypoints` con IDs `TEXT` (UUID v4 como string), columnas `activity_type`/`type`. `PRAGMA journal_mode = WAL` + `foreign_keys = ON`. `runMigrations()` hace `ALTER TABLE ADD COLUMN` idempotente (no hay sistema de versiones).
- **Supabase** (`supabase/schema.sql`) es el backend remoto (push-only), en una **base de datos compartida** con otra plataforma. Tablas prefijadas `nk_*` (`src/infrastructure/supabase/tables.ts`), IDs `UUID`, RLS por usuario con `SELECT/INSERT/UPDATE/DELETE`, Storage `nk-waypoint-images`. Auth (`auth.users`) compartido; Ñan Kamay no toca `profiles` ni las tablas de la otra plataforma.
- **Mappers** (`RouteMapper`, `WaypointMapper`, `GpsPointMapper`): traducen Entidad ↔ fila SQLite ↔ shape Supabase, incluyendo `activityType`/`type`.

### GPS

- `GpsServiceImpl` implementa `IGpsService`: `watchPositionAsync` (foreground) + `BACKGROUND_LOCATION_TASK` via `TaskManager` (sin `foregroundService` de expo-location, intencional por crash Android 12+) + notificación persistente con `expo-notifications`.
- **Pipeline `GpsFilter`** (5 etapas en serie): precisión → estacionario → Kalman 1D (`KalmanFilter1D`) → desplazamiento mínimo → anti-teleport.

### Sync / Storage / Export

- `SyncServiceImpl`: sube rutas no sincronizadas (`upsert`) + imágenes a Supabase Storage (`ImageUploadService`, base64).
- `ExportServiceImpl`: genera GPX 1.1 / KML 2.2 / KMZ (JSZip) manualmente, escribe en `documentDirectory/exports/`.

---

## 6. Violaciones de arquitectura conocidas

Documentadas para que no se "descubran" como sorpresa:

1. Pantallas (`login`, `register`, `profile`, `_layout`) llaman `supabase` directamente — el flujo de auth **no pasa por dominio/aplicación**.
2. `routes/[id].tsx` usa `routeRepository` (impl concreta) en vez de un use-case.
3. `GetPublicRoutesUseCase` (aplicación) usa `supabaseClient` directamente.
4. Use-cases acoplados a singletons concretos; **sin contenedor DI**.
5. `summary.tsx` orquesta guardado + sync (lógica de negocio en componente).
6. `IAuthRepository`, `AuthError`, `GpsError` definidos y nunca usados (código muerto).
7. Dominio anémico: entidades y value-objects sin validación.

> Para el detalle con severidad y plan de remediación: **[`docs/VALIDATION.md`](./docs/VALIDATION.md)**.

---

## 7. Estado global — Zustand

Cuatro stores, uno por dominio (sin middleware `persist` salvo lo que Supabase persiste en SecureStore):

| Store | Estado clave | Notas |
|-------|--------------|-------|
| `authStore` | `user`, `isLoading` | Hidratado por el listener `onAuthStateChange` en `_layout.tsx` |
| `trackingStore` | `status`, `routeId`, `gpsPoints`, `waypoints`, `liveStats`, `startedAt`, `totalPausedSeconds` | Todo en memoria; sin persistencia incremental |
| `routesStore` | `routes`, `isLoading`, `isSyncing`, `lastSyncedAt` | Lee SQLite vía use-cases |
| `uiStore` | `toasts`, `isOffline` | Toasts globales + estado de red |

**Regla de facto:** los stores llaman use-cases (excepto `authStore`, que depende del listener de Supabase). Los componentes leen stores y, a veces, llaman use-cases directamente (violación tolerada en `summary.tsx` y `routes/[id].tsx`).

---

## 8. Navegación — Expo Router

Root configurado en `src/app` (`app.json` → `expo-router.root`). Grupos:

- `(auth)/` — login, register (sin guard de "ya autenticado").
- `(tabs)/` — Home / Explore / Profile (**sin guard de auth reactivo**, ver validación §A4).
- `tracking/` — pre-recording → active → waypoint(-types) → summary (stack modal-like, `router.replace` entre fases).
- `routes/[id]` — detalle dinámico.

La protección de rutas depende **únicamente** del redirect en `src/app/index.tsx`, evaluado al entrar por la raíz.

---

## 9. Decisiones técnicas que sí se respetan

1. **Offline-first**: SQLite como verdad local; Supabase como (intento de) backup remoto.
2. **Background GPS sin `foregroundService` de expo-location**: notificación propia con `expo-notifications`.
3. **Entry point custom** `index.ts`: `TaskManager.defineTask` antes de Expo Router.
4. **MapLibre `Camera` con `defaultSettings`** + `RasterSource` con `key` dinámico por capa.
5. **Selección de tipo de waypoint vía estado de módulo** (`waypointSelection.ts`) + `router.back()` + `useFocusEffect` (evita perder el formulario).
6. **GPX/KML/KMZ manuales** sin librería (control total del formato).

---

> **Última actualización:** 2026-05-17 · Refleja el código en la rama `master`.
> Documento anterior (plantilla genérica de e-commerce) descartado por no corresponder al proyecto.
