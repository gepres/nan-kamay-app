# Informe de Validación de Flujos — Ñan Kamay

> Revisión estática del código (sin ejecutar la app). Cada hallazgo fue **verificado leyendo el código fuente**, no inferido.
> Fecha: 2026-05-17 · Rama: `master` · Alcance: flujos de auth, grabación GPS, guardado/sync y exportación.

---

## ✅ Actualización 2026-05-18 — correcciones aplicadas

Tras migrar a la base de datos compartida (con prefijo `nk_`), se corrigieron:

| Hallazgo | Estado | Cómo |
|----------|--------|------|
| **C1** IDs no-UUID | ✅ Resuelto | `src/shared/utils/uuid.ts` (`uuidv4`) en Route/Waypoint/GpsPoint/trackingStore/SyncService |
| **C2** CHECK dificultad 3 valores | ✅ Resuelto | `nk_routes.difficulty CHECK` con los 5 valores |
| **C3** `waypoint.type` no persiste | ✅ Resuelto | `WaypointMapper` (3 funciones) + columna `type` en SQLite/`nk_waypoints` |
| **C4** `activityType` no persiste | ✅ Resuelto | `RouteMapper` (3 funciones) + columna `activity_type` en SQLite/`nk_routes` |
| **A1** CASCADE local inactivo | ✅ Resuelto | `PRAGMA foreign_keys = ON` en `initDatabase` |
| **A7** RLS sin UPDATE | ✅ Resuelto | Políticas `*_update` para `nk_gps_points`/`nk_waypoints`/`nk_waypoint_images` |
| **A9** `waypoint_images.id` no-UUID | ✅ Resuelto | `uuidv4()` en `SyncServiceImpl` |
| **A2** GPS no se detiene al finalizar | ✅ Resuelto | `gpsService.stopTracking()` explícito en `active.tsx` `handleStop` antes de navegar |
| **A4** Sin guard de auth reactivo | ✅ Resuelto | `(tabs)/_layout.tsx` redirige a login si `authStore.user` es null (reactivo) |
| **M10** Errores de sync silenciados | ✅ Resuelto | `routesStore.syncRoutes` expone `errors`; toasts en `summary.tsx` y Home (auto/manual) |
| **A3** Pérdida de ruta si el SO mata el proceso | ✅ Resuelto | Ruta = borrador en SQLite (`is_draft`); puntos/waypoints persistidos incrementalmente; el `BACKGROUND_LOCATION_TASK` escribe directo a SQLite cuando el proceso revive headless; diálogo de recuperación (Reanudar/Finalizar/Descartar) en Home |
| **C3/C4** (path local SQLite) | ✅ Completado | `RouteRepositoryImpl.save()` usaba listas de columnas explícitas que **no incluían** `activity_type`/`type` (el fix anterior solo cubrió el path Supabase). Ahora el INSERT local incluye `activity_type`, `type`, `is_draft` |
| **A5** Google OAuth no operativo | ✅ Resuelto | `expo-web-browser` + PKCE: `googleAuth.ts` (`openAuthSessionAsync` + `exchangeCodeForSession`); `flowType: 'pkce'`; wired en login/register con loading |
| **A6** Sync push-only (single-device) | ✅ Resuelto | `pullRemoteRoutes` descarga rutas+gps+waypoints+imágenes a SQLite; `syncRoutes` hace push+pull; borrado remoto best-effort en `deleteRouteUseCase` |
| **A8** Imágenes re-subidas en reintento | ✅ Resuelto | URLs remotas persistidas en SQLite tras subir (`updateWaypointImageUris`); `nk_waypoint_images` delete+insert por waypoint (idempotente) |
| Colisión de tablas con plataforma | ✅ Resuelto | Prefijo `nk_` (`src/infrastructure/supabase/tables.ts`); auth compartido sin tocar `profiles` |

**Requisito:** ejecutar `supabase/schema.sql` (idempotente) en el SQL Editor del proyecto compartido para crear las tablas `nk_*` y el bucket `nk-waypoint-images`.

**Matiz de A3 (background headless):** cuando el SO mata el proceso y lo revive solo para entregar ubicaciones al `TaskManager`, el estado del filtro Kalman **no sobrevive** (es memoria del proceso muerto). En ese tramo se aplica únicamente un gate de precisión (≤25 m) + desplazamiento mínimo (≥8 m), sin Kalman. Resultado: el tramo grabado en proceso-muerto es algo más ruidoso, pero **la ruta no se pierde** (antes se perdía entera). Los tramos en foreground/app-viva siguen usando el pipeline completo de 5 etapas.

**Config requerida para A5 (Google OAuth):** en Supabase Dashboard → *Auth → Providers → Google* (habilitar con Client ID/Secret) y *Auth → URL Configuration → Redirect URLs* añadir **`nan-kamay://auth-callback`**. Requiere rebuild del dev client (se añadió `expo-web-browser`).

**Alcance de A6:** sync de **lectura** bidireccional (push + pull) + borrado remoto best-effort. No hay merge a nivel de campo (las rutas son inmutables tras crearse): remoto es autoritativo para rutas ya sincronizadas; no se pisa un borrador ni una ruta local pendiente de subir. Al borrar offline, la copia remota permanece hasta el próximo borrado online. Los objetos de Storage de imágenes no se borran en cascada (huérfanos menores; pendiente 🟡).

**Lote 🟡 resuelto (2026-05-18):**

| Item | Resuelto con |
|------|--------------|
| **M3** stats O(n²) en vivo | `StatsCalculator` con acumulador incremental O(1) (`accumulate`/`finalize`/`buildAccumulator`); `addGpsPoint` ya no recalcula todo el array. Replica exactamente el algoritmo batch; `finishRecording` mantiene recálculo canónico |
| **M7** formatters sin guardas | `finite()` + clamp en `formatDistance/Duration/Speed/Elevation`; `formatDate` valida `Date` |
| **M6** XML: control chars / NaN | `escXml` elimina control chars ilegales XML 1.0 (conserva TAB/LF/CR); helper `num()` evita `NaN`/Infinity en lat/lon/ele/coords; `iso()` para fechas inválidas |
| **M5** KMZ imágenes | Imágenes embebidas ahora **referenciadas** en el KML (`<description><![CDATA[<img>]]>`); lectura por-imagen con try/catch (una imagen borrada ya no aborta el KMZ) |
| **M11** fuga `exports/` | `writeFile` purga el directorio antes de escribir (best-effort) |
| **M2** `reset()` incompleto | Resetea también `routeDescription`, `activityType`, `_statsAcc` |
| **M8** `explore` no recarga | `useEffect` depende de `[load]` (recarga al loguear/reconectar) |
| **M4** Kalman reset en resume | Quitado el `reset()` del efecto `[status]`; + `startTracking` idempotente (evita 2ª suscripción de `watchPositionAsync` en cada reanudar) |
| **M15** prop `useOutdoorTiles`/'osm' | Eliminada (código muerto) en `TrackingMap` |
| Import muerto | `Alert` no usado quitado de `ExportButtons` |

**Lote final 🟡 resuelto (2026-05-18):**

| Item | Resuelto con |
|------|--------------|
| **M16** `minElevation` no persistía | Columna `min_elevation_meters` en SQLite + `nk_routes` + mappers (row/supabase/supabaseToRoute) + `save()`/`createDraft()` + `SaveRouteUseCase`/`startDraftRoute`; mostrado en summary |
| **M12** recientes de waypoint | Persistidos en AsyncStorage (`nk:recentWaypointTypes`, máx 5); sobreviven al cierre del modal/app |
| **M14** mapa roto silencioso | `MissingTileKeyBanner`: aviso visible en `TrackingMap`/`RouteMap` si falta `EXPO_PUBLIC_THUNDERFOREST_API_KEY`; `RouteMap` también silencia "permanent error: Canceled" (consistencia) |
| **M17** `profile.tsx` placeholder | Estadísticas agregadas (rutas, distancia/tiempo totales, desnivel acumulado) desde `routesStore` — sin tocar `profiles` (decisión previa) |
| **A6-ext** borrado cross-device | `pullRemoteRoutes` borra localmente rutas **sincronizadas** ausentes en remoto (delete-propagation sin tabla de tombstones); `deleteRemoteRoute` limpia objetos de Storage antes del CASCADE |

**Deuda arquitectónica — DEFERIDA deliberadamente:** presentación→infra directa (auth/screens llaman `supabase`), use-cases como función en vez de clase, `IAuthRepository` huérfano, ausencia de contenedor DI. Es un refactor amplio y de alto riesgo (toca auth/sync que ya funcionan) **sin ganancia funcional**. Recomendación: abordarlo como esfuerzo dedicado y aislado, no junto a correcciones. Ver `ARCHITECTURE.md` §6.

**No quedan 🟡 de impacto pendientes.** El resto de este documento describe el estado **original** (pre-fix) para trazabilidad.

## Veredicto rápido

| Flujo | ¿Validado? | Estado |
|-------|-----------|--------|
| Autenticación (email/sesión) | ⚠️ Parcial | Funciona, pero sin protección de rutas reactiva y OAuth Google no operativo |
| Grabación GPS (foreground) | ✅ Funcional | Pipeline de filtrado correcto; race condition al finalizar |
| Grabación GPS (background) | ⚠️ Frágil | Sin persistencia incremental: si el SO mata el proceso se pierde la ruta |
| Guardado offline (SQLite) | ✅ Funcional | Pierde `activityType` y `waypoint.type`; CASCADE inactivo |
| **Sincronización a Supabase** | ❌ **Roto** | **No funciona end-to-end** (IDs no-UUID + CHECK de dificultad) |
| Exportación GPX/KML/KMZ | ✅ Funcional | KMZ embebe imágenes pero el KML no las referencia |

**Conclusión:** la app es **offline-first operativa** (grabar, guardar local, ver detalle, exportar funcionan), pero la **sincronización con el backend está rota** y hay **pérdida silenciosa de datos** (`activityType`, tipo de waypoint). Los flujos **no están validados** para producción multi-dispositivo.

---

## 🔴 Críticos (rompen funcionalidad o pierden datos)

### C1 — La sincronización a Supabase falla siempre: IDs no son UUID

- **Dónde:** `src/core/entities/Route.ts:30`, `src/core/entities/Waypoint.ts:20`, `src/core/entities/GpsPoint.ts` (`create`), `src/presentation/stores/trackingStore.ts:63`.
- **Qué pasa:** los IDs se generan como `` `${Date.now()}-${Math.random().toString(36).slice(2,11)}` `` → strings tipo `1737000000000-ab12cd34e`.
- **Conflicto:** `supabase/schema.sql:8,29,42,54` define **todas** las columnas `id` como `UUID PRIMARY KEY`. Postgres rechazará cada `upsert` con `invalid input syntax for type uuid`.
- **Resultado:** `SyncServiceImpl.syncOfflineRoutes` marca cada ruta como `failed`; **ninguna ruta llega nunca a Supabase**. El error se silencia (`summary.tsx` → `.catch(console.error)`), el usuario no se entera.
- **Nota:** SQLite local usa `TEXT` (`sqliteDb.ts:11,31,44`), por eso el guardado local sí funciona. El sync remoto, no.
- **Fix:** generar UUID v4 reales (p. ej. `expo-crypto` `randomUUID()` o `crypto.randomUUID()`) en las entidades y en `trackingStore.startRecording`.

### C2 — CHECK de dificultad rechaza `very_hard` y `expert`

- **Dónde:** `supabase/schema.sql:12-13` → `CHECK (difficulty IN ('easy','moderate','hard'))`.
- **Conflicto:** `src/core/value-objects/Difficulty.ts` y la UI permiten 5 niveles (`easy | moderate | hard | very_hard | expert`).
- **Resultado:** aun arreglando C1, cualquier ruta `very_hard`/`expert` viola el CHECK → `failed` silencioso.
- **Fix:** `ALTER TABLE ... DROP CONSTRAINT` y recrear con los 5 valores; alinear `schema.sql`.

### C3 — El tipo de waypoint NO se persiste (feature estrella rota)

- **Dónde:** `WaypointProps.type` existe (`src/core/entities/Waypoint.ts:9,36`) pero `src/infrastructure/mappers/WaypointMapper.ts` **no mapea `type`** en `waypointToRow` (línea 24), `waypointToSupabase` (39) ni `rowToWaypoint` (3). Las tablas `waypoints` (`sqliteDb.ts:43-54` y `schema.sql:41-50`) **no tienen columna `type`**.
- **Resultado:** los 50+ tipos de waypoint (`waypointTypes.ts`) se eligen en la UI pero se descartan al guardar. Al recargar, todo waypoint es genérico (de hecho `routes/[id].tsx:189` ya pinta un `Ionicons "flag"` fijo).
- **Fix:** añadir columna `type TEXT` a SQLite + Supabase, mapearla en los 3 mappers, e incluir migración.

### C4 — `activityType` se descarta silenciosamente al guardar

- **Dónde:** `RouteProps.activityType` existe (`src/core/entities/Route.ts:8,44`) y se pasa hasta `SaveRouteUseCase`, pero `RouteMapper.routeToRow` (`RouteMapper.ts:28`) y `routeToSupabase` (52) **no lo incluyen**; no hay columna `activity_type` en SQLite ni Supabase.
- **Resultado:** el tipo de actividad elegido en `pre-recording.tsx` nunca se persiste.
- **Fix:** añadir `activity_type TEXT` al esquema y a los mappers.

---

## 🟠 Importantes (robustez / pérdida de datos en casos reales)

### A1 — `ON DELETE CASCADE` local inactivo: filas huérfanas

- **Dónde:** `src/infrastructure/database/sqliteDb.ts:7-8` solo ejecuta `PRAGMA journal_mode = WAL`. Falta `PRAGMA foreign_keys = ON`.
- **Qué pasa:** expo-sqlite **no activa FK por defecto**. Las FK `ON DELETE CASCADE` (`sqliteDb.ts:40,53`) **no se aplican**. El comentario en `RouteRepositoryImpl` que dice "CASCADE borra automáticamente" es falso en esta configuración.
- **Resultado:** al borrar una ruta, sus `gps_points` y `waypoints` quedan **huérfanos acumulándose** indefinidamente.
- **Fix:** añadir `PRAGMA foreign_keys = ON;` en `initDatabase`, o borrar hijos explícitamente en `RouteRepositoryImpl.delete`.

### A2 — El GPS puede no detenerse al finalizar la ruta (race condition)

- **Dónde:** `src/presentation/hooks/useTracking.ts:72-87` + `src/app/tracking/active.tsx` (`finishRecording()` seguido de `router.replace('/tracking/summary')`).
- **Análisis:** el efecto **sí** tiene una rama `status === 'finished'` que llama `stopTracking()` (línea 78-80), y el cleanup también (82-86). Pero `active.tsx` cambia el estado a `finished` y navega de forma **síncrona consecutiva**. Si el desmontaje de `active.tsx` ocurre antes de que el efecto con `status === 'finished'` se confirme, el cleanup corre con el closure `status === 'recording'` → **no** llama `stopTracking()`.
- **Resultado (probabilístico):** `watchPositionAsync` + `BACKGROUND_LOCATION_TASK` + notificación persistente pueden quedar vivos tras finalizar → drenaje de batería/sensor y callback apuntando a un componente desmontado.
- **Fix:** llamar `gpsService.stopTracking()` explícitamente dentro de `handleStop` en `active.tsx` **antes** de `finishRecording()`/`router.replace`, sin depender del ciclo de efectos.

### A3 — Sin persistencia incremental: matar la app pierde toda la ruta

- **Dónde:** todo el estado de grabación vive en memoria (`trackingStore.ts`); no se escribe a SQLite hasta `summary.tsx`.
- **Qué pasa:** si el SO mata el proceso durante background tracking, `BACKGROUND_LOCATION_TASK` reanima el proceso pero `useTrackingStore` vuelve a `idle` y `_backgroundCallback` es `null` → los updates se descartan. **Se pierde toda la grabación** sin recuperación.
- **Impacto:** crítico para una app de trekking offline (rutas largas, app en background horas).
- **Fix:** persistir puntos incrementalmente en SQLite (buffer cada N puntos) y recuperar sesión activa al arrancar.

### A4 — Sin protección de rutas reactiva en `(tabs)`

- **Dónde:** `src/app/(tabs)/_layout.tsx` no consulta `useAuthStore`. La única barrera es la redirección de `src/app/index.tsx`, evaluada solo al entrar por la raíz.
- **Qué pasa:** si la sesión expira/invalida estando dentro de tabs (`SIGNED_OUT`), `authStore` pone `user = null` pero **ninguna pantalla redirige a login**; quedan con `user` nulo (p. ej. `profile.tsx` con `user?.fullName ?? 'Usuario'`, queries por `user.id` con `user` nulo).
- **Fix:** guard reactivo en `(tabs)/_layout.tsx` (`if (!user) return <Redirect href="/(auth)/login" />`).

### A5 — Login con Google OAuth no funcional

- **Dónde:** `src/app/(auth)/login.tsx:40-43`, `src/app/(auth)/register.tsx:68-71` → `supabase.auth.signInWithOAuth({ provider: 'google' })` sin `redirectTo`, sin abrir navegador (`expo-web-browser`), sin capturar el callback. Además `supabaseClient.ts:17` tiene `detectSessionInUrl: false` y `handleAuthDeepLink` solo parsea `#access_token` (flujo implícito), no `?code=` (PKCE de OAuth).
- **Resultado:** el botón Google no autentica.
- **Fix:** implementar el flujo OAuth con `expo-web-browser` + `redirectTo` con scheme `nan-kamay://` + `exchangeCodeForSession`.

### A6 — Sync push-only: no descarga rutas (single-device de facto)

- **Dónde:** `GetRoutesUseCase.ts` lee **solo** SQLite; `SyncServiceImpl` solo sube. No hay pull de Supabase ni tombstones para borrados.
- **Resultado:** borrar una ruta sincronizada no la borra en remoto; las rutas no se propagan entre dispositivos. La app es efectivamente single-device pese a tener backend.
- **Fix:** definir estrategia de sync bidireccional + tombstones, o documentar explícitamente que el backend es solo backup.

### A7 — Sin política UPDATE en RLS para `gps_points`/`waypoints`

- **Dónde:** `supabase/schema.sql:87-118` define `SELECT/INSERT/DELETE` para `gps_points` y `waypoints`, **no `UPDATE`**. `SyncServiceImpl` usa `upsert` con `onConflict:'id'`.
- **Resultado:** un re-sync de una ruta ya parcialmente subida resuelve a `UPDATE` y es rechazado por RLS (suponiendo C1/C2 ya resueltos).
- **Fix:** añadir políticas `*_update`, o borrar+reinsertar hijos en el sync.

### A8 — Imágenes duplicadas en cada reintento de sync

- **Dónde:** `SyncServiceImpl` + `ImageUploadService.ts`. Las `imageUris` en SQLite nunca se actualizan a la URL remota; `uploadWaypointImages` solo salta URIs `http`. Si una ruta falla parcialmente, en el siguiente intento re-sube las mismas imágenes con `storage_path` nuevo (`${Date.now()}`) e inserta filas `waypoint_images` con `id` nuevo.
- **Resultado:** acumulación ilimitada en Storage + filas huérfanas (agravado por C1 que hace fallar siempre).

### A9 — `waypoint_images.id` no es UUID

- **Dónde:** `SyncServiceImpl` genera `id: ${Date.now()}-${Math.random()...}`; `schema.sql:54` exige `UUID`. Mismo problema que C1 para esta tabla.

---

## 🟡 Menores / deuda técnica

| ID | Hallazgo | Ubicación |
|----|----------|-----------|
| M1 | No existe sistema de migraciones SQLite; `initDatabase` solo hace `CREATE TABLE IF NOT EXISTS`. Cambios de esquema (C3/C4) no llegan a DBs existentes. **No existe `src/infrastructure/database/migrations/`** pese a que CLAUDE.md lo lista. | `sqliteDb.ts` |
| M2 | `trackingStore.reset()` no resetea `routeDescription` ni `activityType` → se filtran entre grabaciones. | `trackingStore.ts:126-140` |
| M3 | `addGpsPoint` recalcula `StatsCalculator.calculate` sobre **todo** el array por cada punto → O(n²) acumulado; rutas de varias horas degradan rendimiento/batería. | `trackingStore.ts:96-105` |
| M4 | Reset del filtro Kalman en cada `recording` (incluido reanudar tras pausa) → discontinuidad/posible micro-teleport no validado tras pausa. | `useTracking.ts:74` |
| M5 | KMZ embebe imágenes en `images/` pero el `doc.kml` **nunca las referencia** (`buildKml` no genera `<img>`/`<PhotoOverlay>`) → ningún visor las muestra. Si una URI local fue borrada, `readAsStringAsync` aborta toda la exportación. | `ExportServiceImpl.ts` |
| M6 | `escXml` no elimina caracteres de control (0x00–0x1F) ilegales en XML 1.0; `lat/lon` sin validar pueden interpolar `NaN` → GPX/KML inválido. | `ExportServiceImpl.ts` |
| M7 | `formatSpeed/Distance/Elevation/Duration` sin guardas para `NaN`/negativos/Infinity → `"NaN km/h"` visible en `routes/[id].tsx`. | `shared/utils/formatters.ts` |
| M8 | `explore.tsx` usa `useEffect(() => load(), [])` con deps vacías → no recarga al iniciar sesión / volver online / cambiar de usuario. | `src/app/(tabs)/explore.tsx` |
| M9 | Auto-sync en Home depende solo de `[isOffline]`; abrir la app ya online no dispara sync de rutas pendientes (solo botón manual). | `src/app/(tabs)/index.tsx:33-46` |
| M10 | `errors silenciados`: múltiples `.catch(() => {})` / `.catch(console.error)` (notificación, sync en summary, startBackgroundTracking). El usuario nunca ve por qué falló el sync (esconde C1/C2). | varios |
| M11 | Sin limpieza de `documentDirectory/exports/` → fuga de almacenamiento a largo plazo. | `ExportServiceImpl.ts` |
| M12 | `requestPermissions` retorna `true` con solo permiso foreground; el background no arranca y no hay feedback "solo primer plano". | `GpsServiceImpl.ts` |
| M13 | Doble solicitud de permisos: `pre-recording.tsx` (singleton infra directo) **y** `active.tsx` al montar. | `pre-recording.tsx`, `active.tsx` |
| M14 | Cambio de capa de mapa: si la API key de Thunderforest falta o el estilo es inválido, los tiles fallan **en silencio** (`Logger.setLogCallback` silencia "Failed to load tile") sin fallback visual. Esto explica el "capa (sigue sin funcionar)" de los commits recientes. | `TrackingMap.tsx` |
| M15 | `prop useOutdoorTiles` `@deprecated` con rama `'osm'` inexistente en `mapLayers.ts`. Código muerto. | `TrackingMap.tsx` |
| M16 | `min_elevation_meters` se calcula (`StatsCalculator`) pero no se persiste en ningún esquema. | `StatsCalculator.ts` |
| M17 | `profile.tsx` es placeholder (sin estadísticas ni ajustes). | `src/app/(tabs)/profile.tsx` |

---

## Violaciones de arquitectura (Clean / Hexagonal)

El proyecto declara Clean Architecture + Hexagonal, pero el código la viola de forma sistemática:

1. **Presentación → Infraestructura directa:** `login.tsx`, `register.tsx`, `profile.tsx`, `_layout.tsx` importan y llaman `supabase` (cliente) sin pasar por puerto ni use-case.
2. **Presentación → Repositorio concreto:** `routes/[id].tsx` usa `routeRepository` (impl) en vez de un use-case.
3. **Aplicación → Infraestructura directa:** `GetPublicRoutesUseCase.ts` importa `supabaseClient` y hace `supabase.from(...)` saltándose `IRouteRepository`.
4. **Use-cases acoplados a singletons concretos:** `ExportRouteUseCase`, `SaveRouteUseCase`, etc. importan `routeRepository`/`exportService` en vez de recibir puertos por inyección. **No hay contenedor DI.**
5. **Lógica de orquestación en componentes:** `summary.tsx` orquesta guardado + sync, contra la regla "no lógica de negocio en componentes" de CLAUDE.md.
6. **Puertos huérfanos:** `IAuthRepository` definido sin implementación (`AuthRepositoryImpl` no existe). `AuthError`/`GpsError` definidos y nunca usados.
7. **Dominio anémico:** `Route/Waypoint/GpsPoint` no validan invariantes en `create`; `Coordinates` no valida rangos lat/lon; faltan los value-objects `Distance/Duration/Speed/Elevation` documentados.

> Esto no es necesariamente "malo" para un MVP, pero **la documentación afirma una arquitectura que el código no implementa**. Ver `ARCHITECTURE.md` (reescrito) para el mapa honesto.

---

## Plan de remediación priorizado

| Prioridad | Acción | Resuelve |
|-----------|--------|----------|
| P0 | Generar UUID v4 reales para route/gps/waypoint/waypoint_image | C1, A9 |
| P0 | Alinear `schema.sql` (5 dificultades, columnas `activity_type` y `type`) + script de migración Supabase | C2, C3, C4 |
| P0 | `PRAGMA foreign_keys = ON` en `initDatabase` | A1 |
| P0 | `stopTracking()` explícito en `handleStop` antes de navegar | A2 |
| P1 | Persistencia incremental de la ruta en SQLite + recuperación de sesión | A3 |
| P1 | Guard de auth reactivo en `(tabs)/_layout.tsx` | A4 |
| P1 | Mapear `type`/`activity_type` en mappers + migración SQLite | C3, C4, M1 |
| P1 | Surfacing de errores de sync al usuario (toast con `result.errors`) | M10 |
| P2 | OAuth Google completo; políticas RLS UPDATE; sync idempotente de imágenes | A5, A7, A8 |
| P3 | Resto de 🟡 (perf O(n²), formatters defensivos, limpieza exports, KMZ→KML imágenes) | M3, M5, M7, M11 |
