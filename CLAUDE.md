# Ñan Kamay — Guia del Proyecto para Claude

> "Ñan Kamay" (Quechua: "el camino de la mano") — App React Native para grabacion de rutas de sendero y montana.

---

## Descripcion del Proyecto

Aplicacion movil para registrar rutas de trekking/senderismo con GPS, funcional online y offline. Los usuarios pueden grabar su recorrido, anadir waypoints con multimedia, ver estadisticas al finalizar y exportar la ruta en formatos estandar.

---

## Stack Tecnologico

| Capa | Tecnologia |
|------|------------|
| Framework | **Expo SDK 55** (React Native) + TypeScript |
| Routing | **Expo Router** (file-based) |
| Estilos | **NativeWind** (TailwindCSS para RN) |
| Estado Global | **Zustand** |
| HTTP Client | **Axios** |
| Base de Datos | **Supabase** (PostgreSQL) |
| Autenticacion | **Supabase Auth** (Email + Google OAuth) |
| Mapas | **MapLibre GL** (`@maplibre/maplibre-react-native` v10.4) + **Thunderforest** tiles (9 estilos) |
| GPS | **expo-location** (foreground + background via TaskManager) |
| Notificaciones | **expo-notifications** (notificacion persistente con stats en vivo) |
| Storage Offline | **expo-sqlite** (rutas no sincronizadas) |
| Storage Rapido | **react-native-mmkv** (cache y preferencias) |
| Storage Seguro | **expo-secure-store** (tokens) |
| Imagenes | **expo-image-picker** + **expo-file-system** |
| Iconos | **lucide-react-native** (waypoint types + layer selector) + **@expo/vector-icons** (Ionicons) |
| Exportacion | Custom: GPX, KML, KMZ (JSZip) |
| Animaciones | **react-native-reanimated** |

---

## Diseno

- **Archivo Pencil**: `pencil/trek-kamay.pen`
- **Tema**: Dark mode, paleta verde bosque + accent ambar
- **Fuente**: Inter (UI general), Sora (titulos destacados)

### Colores Design Tokens (`src/presentation/theme/colors.ts`)
| Variable | Hex | Uso |
|----------|-----|-----|
| `accent` | `#F59E0B` | Ambar — color principal de accion |
| `accentSoft` | `#F59E0B30` | Ambar con transparencia (fondos activos) |
| `bgPrimary` | `#0D1B12` | Fondo principal |
| `bgCard` | `#1B4332` | Fondo tarjetas |
| `bgElevated` | `#2D6A4F` | Fondo elevado / hover |
| `bgInput` | `#14291D` | Fondo inputs |
| `textPrimary` | `#FFFFFF` | Texto principal |
| `textSecondary` | `#A7C4B5` | Texto secundario |
| `textMuted` | `#6B8F7B` | Texto apagado |
| `border` | `#2D6A4F` | Bordes |
| `easy` | `#22C55E` | Dificultad facil |
| `medium` | `#F59E0B` | Dificultad media |
| `hard` | `#EF4444` | Dificultad dificil |
| `veryHard` | `#DC2626` | Dificultad muy dificil |
| `expert` | `#991B1B` | Solo expertos |
| `success` | `#22C55E` | Marcadores de exito |
| `danger` | `#EF4444` | Peligro / error |

### Pantallas disenadas (Pencil)
1. **Home Screen** — Lista de rutas guardadas + TabBar
2. **Pre-recording Modal** — Nombre, dificultad (5 niveles), tipo actividad (custom), permisos GPS
3. **Active Tracking** — Mapa en vivo + stats + controles + brujula + zoom + selector de capas
4. **Add Waypoint Modal** — Titulo, descripcion, tipo de punto (50+ tipos), fotos (camara/galeria)
5. **Waypoint Type Selector** — Grid categorizado con busqueda, recientes, 4 categorias
6. **Layer Selector Modal** — Bottom sheet con 9 estilos de mapa Thunderforest
7. **Route Summary** — Estadisticas finales + perfil de elevacion + exportacion
8. **Route Detail** (`routes/[id].tsx`) — Stats grid, mapa, waypoints, export
9. **Login Screen** — Email + Google OAuth
10. **Register Screen** — Registro con email + Google OAuth

### Componentes Reutilizables (Pencil)
- `Component/Button/Primary` — Boton primario (fill accent)
- `Component/Button/Secondary` — Boton secundario (borde accent)
- `Component/Badge` — Badge de dificultad (Facil/Moderado/Dificil/Muy Dificil/Expertos)
- `Component/Input` — Input con label
- `Component/RouteCard` — Tarjeta de ruta con estadisticas
- `Component/TabBar` — Barra de navegacion inferior
- `Component/Chip/Active` y `Component/Chip/Inactive` — Chips de filtro

---

## Arquitectura (Clean Architecture + Hexagonal)

```
Presentacion → Aplicacion → Dominio ← Infraestructura
```

### Estructura de Carpetas

```
index.ts                          # Entry point custom (registra TaskManager ANTES de Expo Router)
app.json                          # Configuracion Expo + permisos nativos
eas.json                          # EAS Build config (preview = APK)
src/
├── app/                          # Expo Router (file-based routing)
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   ├── login.tsx
│   │   └── register.tsx
│   ├── (tabs)/
│   │   ├── _layout.tsx
│   │   ├── index.tsx             # Home (lista de rutas)
│   │   ├── explore.tsx           # Explorar rutas publicas
│   │   └── profile.tsx           # Perfil de usuario
│   ├── tracking/
│   │   ├── pre-recording.tsx     # Modal configuracion (nombre, dificultad, actividad)
│   │   ├── active.tsx            # Grabacion activa (mapa + stats + controles)
│   │   ├── waypoint.tsx          # Modal agregar waypoint
│   │   ├── waypoint-types.tsx    # Selector de tipo de waypoint (grid categorizado)
│   │   └── summary.tsx           # Resumen post-ruta
│   ├── routes/
│   │   └── [id].tsx              # Detalle de ruta guardada
│   ├── _layout.tsx               # Root layout (auth listener, SQLite init, toasts)
│   └── index.tsx                 # Redirect segun auth
│
├── core/                         # DOMINIO — cero dependencias externas
│   ├── entities/
│   │   ├── User.ts
│   │   ├── Route.ts
│   │   ├── Waypoint.ts
│   │   └── GpsPoint.ts
│   ├── value-objects/
│   │   ├── Coordinates.ts
│   │   ├── Distance.ts
│   │   ├── Duration.ts
│   │   ├── Speed.ts
│   │   ├── Elevation.ts
│   │   └── Difficulty.ts         # 'easy' | 'moderate' | 'hard' | 'very_hard' | 'expert'
│   ├── errors/
│   │   ├── DomainError.ts
│   │   ├── AuthError.ts
│   │   ├── GpsError.ts
│   │   └── SyncError.ts
│   ├── ports/
│   │   ├── repositories/
│   │   │   ├── IAuthRepository.ts
│   │   │   ├── IRouteRepository.ts
│   │   │   └── IWaypointRepository.ts
│   │   └── services/
│   │       ├── IGpsService.ts
│   │       ├── IStorageService.ts
│   │       ├── IExportService.ts
│   │       └── ISyncService.ts
│   └── rules/
│       ├── RouteRules.ts
│       └── StatsCalculator.ts
│
├── application/                  # CASOS DE USO
│   ├── auth/
│   ├── tracking/
│   ├── routes/
│   │   ├── GetRoutesUseCase.ts
│   │   ├── GetRouteDetailUseCase.ts
│   │   ├── GetPublicRoutesUseCase.ts
│   │   ├── DeleteRouteUseCase.ts
│   │   ├── SaveRouteUseCase.ts
│   │   └── SyncOfflineRoutesUseCase.ts
│   └── export/
│       └── ExportRouteUseCase.ts  # GPX/KML/KMZ
│
├── infrastructure/
│   ├── supabase/
│   │   ├── supabaseClient.ts
│   │   ├── schema.sql            # Tablas, indices, RLS, Storage bucket
│   │   └── dtos/
│   ├── repositories/
│   │   ├── AuthRepositoryImpl.ts
│   │   ├── RouteRepositoryImpl.ts  # SQLite offline-first + Supabase sync
│   │   └── WaypointRepositoryImpl.ts
│   ├── services/
│   │   ├── GpsServiceImpl.ts       # expo-location foreground + background (TaskManager)
│   │   ├── GpsFilter.ts            # Pipeline 5 etapas: precision → estacionario → Kalman → desplazamiento → anti-teleport
│   │   ├── KalmanFilter1D.ts       # Filtro Kalman por eje (lat/lon/alt)
│   │   ├── ImageUploadService.ts   # Sube imagenes a Supabase Storage
│   │   ├── ExportServiceImpl.ts    # GPX 1.1, KML 2.2, KMZ (JSZip)
│   │   └── SyncServiceImpl.ts
│   ├── database/
│   │   ├── sqliteDb.ts
│   │   └── migrations/
│   ├── mappers/
│   │   ├── RouteMapper.ts
│   │   ├── WaypointMapper.ts
│   │   └── GpsPointMapper.ts
│   └── config/
│       └── env.ts                  # Variables de entorno + thunderforestTileUrls(style)
│
├── presentation/
│   ├── components/
│   │   ├── ui/
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Badge.tsx
│   │   │   ├── Chip.tsx
│   │   │   ├── RouteCard.tsx       # Animated entry + press scale
│   │   │   ├── WaypointIcon.tsx    # Wrapper lucide-react-native (50+ iconos mapeados)
│   │   │   ├── ToastContainer.tsx  # Notificaciones animadas (spring + fade)
│   │   │   ├── OfflineBanner.tsx   # Banner animado online/offline
│   │   │   └── ElevationChart.tsx  # Perfil de elevacion (barras con degradado)
│   │   ├── map/
│   │   │   ├── TrackingMap.tsx     # MapLibre: ruta, waypoints, posicion, capas dinamicas
│   │   │   ├── RouteMap.tsx        # Mapa estatico para rutas guardadas (bounds auto-fit)
│   │   │   └── LayerSelectorModal.tsx  # Bottom sheet: 9 estilos Thunderforest
│   │   ├── tracking/
│   │   │   └── GpsIndicator.tsx    # Indicador senal GPS (±Xm) con pulso animado
│   │   └── routes/
│   │       └── ExportButtons.tsx   # GPX/KML/KMZ con loading + Share nativo
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useTracking.ts         # GPS → GpsFilter → trackingStore + notificacion persistente
│   │   ├── useElapsedTime.ts      # Timer 1s (descuenta pausas)
│   │   ├── useNetworkStatus.ts
│   │   └── useRoutes.ts
│   ├── stores/                    # Zustand
│   │   ├── authStore.ts
│   │   ├── trackingStore.ts       # status, gpsPoints, waypoints, liveStats, currentPosition
│   │   ├── routesStore.ts
│   │   └── uiStore.ts
│   └── theme/
│       └── colors.ts
│
└── shared/
    ├── types/
    │   ├── Result.ts
    │   └── AsyncState.ts
    ├── utils/
    │   ├── formatters.ts          # formatDistance, formatDuration, formatSpeed, formatElevation
    │   ├── waypointSelection.ts   # Module-level state para pasar tipo seleccionado entre pantallas
    │   └── logger.ts
    └── constants/
        ├── waypointTypes.ts       # 50+ tipos en 4 categorias con iconos Lucide
        └── mapLayers.ts           # 9 estilos Thunderforest (outdoors, landscape, cycle, etc.)
```

---

## Esquema de Base de Datos (Supabase)

```sql
routes (
  id UUID PK, user_id UUID FK, name TEXT, description TEXT,
  difficulty TEXT, -- 'easy' | 'moderate' | 'hard' | 'very_hard' | 'expert'
  distance_meters FLOAT, duration_seconds INT,
  elevation_gain_meters FLOAT, elevation_loss_meters FLOAT, max_elevation_meters FLOAT,
  avg_speed_kmh FLOAT, started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ,
  is_public BOOLEAN DEFAULT false, synced_at TIMESTAMPTZ, created_at TIMESTAMPTZ
)

gps_points (
  id UUID PK, route_id UUID FK, latitude FLOAT, longitude FLOAT,
  altitude FLOAT, accuracy FLOAT, speed FLOAT,
  recorded_at TIMESTAMPTZ, sequence_index INT
)

waypoints (
  id UUID PK, route_id UUID FK, latitude FLOAT, longitude FLOAT,
  altitude FLOAT, title TEXT, description TEXT, type TEXT, created_at TIMESTAMPTZ
)

waypoint_images (
  id UUID PK, waypoint_id UUID FK, storage_path TEXT, created_at TIMESTAMPTZ
)
```

---

## Variables de Entorno (.env)

```env
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_THUNDERFOREST_API_KEY=
```

---

## Entry Point y Background Tasks

**IMPORTANTE**: El entry point es `index.ts` (NO `expo-router/entry` directo).

```
index.ts → import GpsServiceImpl (registra TaskManager.defineTask) → import expo-router/entry
```

Esto garantiza que `BACKGROUND_LOCATION_TASK` esta registrado ANTES de que cualquier pantalla intente usarlo. Si `expo prebuild --clean` regenera `index.ts` o `App.tsx`, hay que restaurar nuestro `index.ts` y eliminar `App.tsx`.

`package.json` tiene `"main": "./index.ts"`.

---

## GPS y Background Tracking

### Pipeline de filtrado GPS (`GpsFilter.ts`)
5 etapas en serie:
1. **Precision Gate** — Rechaza lecturas con accuracy > 25m
2. **Deteccion estacionaria** — 3 lecturas consecutivas < 0.5 m/s → congela posicion
3. **Kalman 1D** — Suaviza lat/lon/alt por separado
4. **Desplazamiento minimo** — Ignora movimientos < 8m (ruido GPS)
5. **Anti-teleport** — Rechaza saltos > 15 km/h (para senderismo)

### Foreground tracking
- `Location.watchPositionAsync` con `Accuracy.BestForNavigation`
- `distanceInterval: 10m`, `timeInterval: 5000ms`

### Background tracking
- `Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, ...)` via TaskManager
- SIN `foregroundService` de expo-location (causa crash en Android 12+)
- Notificacion persistente via `expo-notifications` con stats en vivo (distancia + duracion)
- Se actualiza cada 5 segundos desde `useTracking.ts`
- Canal de notificacion `tracking` con importancia LOW (sin sonido)

### Permisos requeridos (app.json)
- Android: `ACCESS_FINE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, `POST_NOTIFICATIONS`
- iOS: `UIBackgroundModes: ["location"]`, `isIosBackgroundLocationEnabled: true`

---

## Mapa y Capas

### TrackingMap (`src/presentation/components/map/TrackingMap.tsx`)
- `forwardRef` con `TrackingMapHandle` (zoomIn, zoomOut, resetNorth)
- `Camera` usa `defaultSettings` (no props declarativas) para evitar reset de zoom
- `onRegionDidChange` → sincroniza `currentZoom` y `currentHeading` refs
- Cada `setCamera` pasa `zoomLevel` + `heading` explicitamente
- `RasterSource` con `key` dinamico por capa para forzar recarga de tiles
- ShapeSources de ruta/waypoints/posicion tienen IDs fijos (no se pierden al cambiar capa)

### Capas disponibles (`src/shared/constants/mapLayers.ts`)
| Key | Nombre | Descripcion |
|-----|--------|-------------|
| `outdoors` | Outdoors | Senderismo (default) |
| `landscape` | Landscape | Vista general del terreno |
| `cycle` | Cycle | Ciclismo, rutas de bici |
| `transport` | Transport | Transporte publico |
| `atlas` | Atlas | Estilo atlas clasico |
| `pioneer` | Pioneer | Estilo vintage/retro |
| `neighbourhood` | Neighbourhood | Detalle urbano |
| `mobile-atlas` | Mobile Atlas | Optimizado para movil |
| `spinal-map` | Spinal Map | Alto contraste |

### Tiles URL
`thunderforestTileUrls(style)` en `env.ts` genera URLs para subdominios a/b/c de Thunderforest.

### Controles del mapa (active.tsx)
- **Brujula**: Rota con heading del mapa (`transform: rotate(-heading)`), press → resetNorth
- **Zoom +/-**: Sincronizado con `onRegionDidChange`, no se resetea con GPS updates
- **Capas**: Abre `LayerSelectorModal` (bottom sheet con 9 opciones)

---

## Waypoints

### 50+ tipos organizados en 4 categorias (`src/shared/constants/waypointTypes.ts`)
- **Geografia y Naturaleza** (16): Interseccion, Cima, Paso de Montana, Cueva, Fuente, Rio, Lago, Cascada, Aguas Termales, Mirador, Playa, Flora, Fauna, Arbol, Obs. de Aves, Panoramica
- **Construcciones Humanas** (19): Refugio Mnt., Refugio Libre, Puente, Puerta, Tunel, Monumento, Castillo, Ruinas, Yacimiento, Arqueologico, Sitio Religioso, Mina, Museo, Patrimonio, Inst. Deportiva, Amarre, Sin Salida, Fin Pavimento, Pago Requerido
- **Viajes** (9): Aparcamiento, Camping, Pernoctacion, Picnic, Parque, Parada Bus, Parada Tren, Metro, Ferry
- **Otros** (6): Waypoint, Foto, Riesgo (rojo), Informacion, Avituallamiento, Geocache

### Flujo de seleccion de tipo
- `waypoint.tsx` muestra tipo actual + recientes como chips
- "Ver todos" navega a `waypoint-types.tsx` (grid 4 columnas con busqueda)
- Seleccion usa `waypointSelection.ts` (module-level state) + `router.back()` + `useFocusEffect` para evitar crear nueva instancia de pantalla

### WaypointIcon (`src/presentation/components/ui/WaypointIcon.tsx`)
- Wrapper sobre lucide-react-native con `ICON_MAP` lookup
- Necesario porque `lucide-react-native` NO exporta un objeto `icons` como `lucide-react`

---

## Builds y Deployment

### Development (con hot reload)
```bash
npx expo prebuild --clean
npx expo run:android
```

### APK de prueba (EAS Cloud)
```bash
eas build --platform android --profile preview
```
`eas.json` configurado con `"buildType": "apk"` para preview y production.

### Notas de prebuild
- `expo prebuild --clean` puede regenerar `index.ts` y `App.tsx` — hay que restaurar nuestro `index.ts` y eliminar `App.tsx`
- Cambios en `app.json` (permisos, plugins) requieren rebuild nativo

---

## Progreso

### Fase 1 — Setup y Autenticacion ✅
- [x] Proyecto Expo inicializado
- [x] NativeWind + Tailwind configurados
- [x] Supabase (auth + db + schema.sql)
- [x] Pantallas Login / Register
- [x] Navegacion Expo Router
- [x] Deep linking para confirmacion email

### Fase 2 — Grabacion GPS ✅
- [x] `GpsServiceImpl.ts` — foreground + background (TaskManager + expo-notifications)
- [x] `GpsFilter.ts` + `KalmanFilter1D.ts` — pipeline de filtrado 5 etapas
- [x] `useTracking.ts` — GPS → filtro → store + notificacion persistente con stats
- [x] `useElapsedTime.ts` — Timer 1s (descuenta pausas)
- [x] `TrackingMap.tsx` — MapLibre con 9 estilos Thunderforest
- [x] `RouteMap.tsx` — Mapa estatico con bounds auto-fit
- [x] `GpsIndicator.tsx` — Indicador senal GPS con pulso animado
- [x] `active.tsx` — GPS real + mapa + brujula + zoom + selector capas
- [x] `pre-recording.tsx` — 5 niveles dificultad + actividades custom + permisos GPS
- [x] Background tracking con notificacion persistente (distancia + duracion en vivo)

### Fase 3 — Persistencia y Sync ✅
- [x] Mappers (SQLite ↔ Entidad ↔ Supabase)
- [x] `RouteRepositoryImpl` — SQLite offline-first
- [x] `ImageUploadService` — Supabase Storage (base64)
- [x] `SyncServiceImpl` — offline → Supabase (rutas + GPS + waypoints + imagenes)
- [x] `SaveRouteUseCase`, `GetRoutesUseCase`, `DeleteRouteUseCase`, `SyncOfflineRoutesUseCase`
- [x] `routesStore` (Zustand) + `useNetworkStatus`
- [x] `RouteCard` — stats, badge dificultad, indicador sync
- [x] `HomeScreen` — FlatList, pull-to-refresh, auto-sync, barra offline
- [x] `summary.tsx` — guardado real + sync automatico

### Fase 4 — Exportacion y Detalle ✅
- [x] `ExportServiceImpl` — GPX 1.1, KML 2.2, KMZ (JSZip + imagenes)
- [x] `ExportRouteUseCase` + `ExportButtons` (3 formatos + Share nativo)
- [x] `routes/[id].tsx` — stats grid, mapa, waypoints, export

### Fase 5 — Polish ✅
- [x] `ToastContainer` — notificaciones animadas
- [x] `ElevationChart` — perfil de elevacion con barras degradado
- [x] Tab Explorar — rutas publicas
- [x] Toggle ruta publica en summary
- [x] Animaciones reanimated en RouteCard, GpsIndicator, ToastContainer, OfflineBanner, active.tsx

### Fase 6 — Waypoints y Capas ✅
- [x] 50+ tipos de waypoint en 4 categorias con iconos Lucide
- [x] Selector de tipo con busqueda y recientes
- [x] Fotos (camara + galeria) en waypoints
- [x] `LayerSelectorModal` — 9 estilos Thunderforest
- [x] Brujula funcional (rota con heading del mapa)
- [x] Zoom +/- funcional (sincronizado con gestos)
- [x] Background tracking con notificacion persistente

### Pendiente
- [ ] Testing (unit + integration)
- [ ] Tiles offline (cache MapLibre)
- [ ] Perfil de usuario (tab profile)

---

## Decisiones Tecnicas Importantes

1. **Offline-first**: SQLite como fuente de verdad local. Supabase como sync remoto.
2. **Background GPS sin foregroundService de expo-location**: En Android 12+ causa crash. Usamos `expo-notifications` para la notificacion persistente + `startLocationUpdatesAsync` sin `foregroundService`.
3. **Entry point custom** (`index.ts`): `TaskManager.defineTask()` debe ejecutarse ANTES de Expo Router. Sin esto: "Task not found".
4. **Camera con defaultSettings**: Usar props declarativas en `<Camera zoomLevel={16}>` causa reset de zoom en cada render. `defaultSettings` solo aplica al montar.
5. **RasterSource con key dinamico**: MapLibre no recarga tiles cuando solo cambia `tileUrlTemplates` en el mismo source ID. El `key` fuerza remount.
6. **Waypoint type selection via module-level state**: `router.navigate` crea nueva instancia de pantalla (pierde datos del form). Solucion: `setPendingWaypointType()` + `router.back()` + `useFocusEffect` + `consumePendingWaypointType()`.
7. **GPX/KML/KMZ manuales**: Generacion sin libreria para control total del formato.
8. **lucide-react-native**: No exporta objeto `icons`. Se usa `WaypointIcon.tsx` con `ICON_MAP` lookup individual.
9. **GpsFilter pipeline**: 5 etapas (precision gate → estacionario → Kalman → desplazamiento minimo → anti-teleport) para limpiar ruido GPS en tiempo real.

---

## Convenciones del Proyecto

- Archivos: `PascalCase.tsx` para componentes, `camelCase.ts` para utilidades
- Imports absolutos: `@core/`, `@application/`, `@infrastructure/`, `@presentation/`, `@shared/` (babel + tsconfig)
- Commits: `feat:`, `fix:`, `refactor:`, `docs:`
- Ramas: `feat/nombre-feature`, `fix/nombre-bug`
- No logica de negocio en componentes React — solo en UseCases y Stores
- Todos los textos UI en espanol
- Colores: SIEMPRE usar tokens de `colors.ts`, nunca hardcodear hex en componentes
- MapLibre logs silenciados: "Failed to load tile" y "permanent error: Canceled" (son normales)
