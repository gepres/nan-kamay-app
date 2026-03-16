# 🏔️ Ñan Kamay — Guía del Proyecto para Claude

> "Ñan Kamay" (Quechua: "el camino de la mano") — App React Native para grabación de rutas de sendero y montaña.

---

## 📋 Descripción del Proyecto

Aplicación móvil para registrar rutas de trekking/senderismo con GPS, funcional online y offline. Los usuarios pueden grabar su recorrido, añadir waypoints con multimedia, ver estadísticas al finalizar y exportar la ruta en formatos estándar.

---

## 🛠️ Stack Tecnológico

| Capa | Tecnología |
|------|------------|
| Framework | **Expo** (React Native) + TypeScript |
| Routing | **Expo Router** (file-based) |
| Estilos | **NativeWind** (TailwindCSS para RN) |
| Estado Global | **Zustand** |
| HTTP Client | **Axios** |
| Base de Datos | **Supabase** (PostgreSQL) |
| Autenticación | **Supabase Auth** (Email + Google OAuth) |
| Mapas | **MapLibre GL** + **Thunderforest Outdoors** tiles |
| GPS | **expo-location** (foreground + background) |
| Storage Offline | **expo-sqlite** (rutas no sincronizadas) |
| Storage Rápido | **react-native-mmkv** (caché y preferencias) |
| Storage Seguro | **expo-secure-store** (tokens) |
| Imágenes | **expo-image-picker** + **expo-file-system** |
| Exportación | Custom: GPX, KML, KMZ (JSZip) |

---

## 🎨 Diseño

- **Archivo Pencil**: `pencil/trek-kamay.pen`
- **Tema**: Dark mode, paleta verde bosque
- **Fuente**: Inter

### Colores Design Tokens
| Variable | Uso |
|----------|-----|
| `$accent` | Verde principal (#22C55E aprox.) |
| `$bg-primary` | Fondo principal (#0D1B12) |
| `$bg-card` | Fondo tarjetas |
| `$bg-input` | Fondo inputs |
| `$text-primary` | Texto principal |
| `$text-secondary` | Texto secundario |
| `$border` | Bordes |
| `$easy` | Badge "Fácil" |
| `$success` | Marcadores de éxito |

### Pantallas diseñadas
1. **Home Screen** — Lista de rutas guardadas + TabBar
2. **Pre-recording Modal** — Configuración antes de grabar (nombre, dificultad)
3. **Active Tracking** — Mapa en vivo + estadísticas en tiempo real + controles
4. **Add Waypoint Modal** — Añadir waypoint con título, descripción, fotos
5. **Route Summary** — Estadísticas finales de la ruta
6. **Login Screen** — Email + Google OAuth
7. **Register Screen** — Registro con email + Google OAuth

### Componentes Reutilizables (Pencil)
- `Component/Button/Primary` — Botón primario (fill accent)
- `Component/Button/Secondary` — Botón secundario (borde accent)
- `Component/Badge` — Badge de dificultad (Fácil/Moderado/Difícil)
- `Component/Input` — Input con label
- `Component/RouteCard` — Tarjeta de ruta con estadísticas
- `Component/TabBar` — Barra de navegación inferior
- `Component/Chip/Active` y `Component/Chip/Inactive` — Chips de filtro

---

## 🏗️ Arquitectura (Clean Architecture + Hexagonal)

Ver `ARCHITECTURE.md` para la guía completa. La regla clave:

```
Presentación → Aplicación → Dominio ← Infraestructura
```

### Estructura de Carpetas del Proyecto

```
src/
├── app/                          # Expo Router (file-based routing)
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   ├── login.tsx
│   │   └── register.tsx
│   ├── (tabs)/
│   │   ├── _layout.tsx
│   │   ├── index.tsx             # Home (lista de rutas)
│   │   ├── explore.tsx           # Explorar rutas públicas
│   │   └── profile.tsx           # Perfil de usuario
│   ├── tracking/
│   │   ├── pre-recording.tsx     # Modal configuración
│   │   ├── active.tsx            # Grabación activa
│   │   └── summary.tsx           # Resumen post-ruta
│   ├── _layout.tsx
│   └── index.tsx                 # Redirect según auth
│
├── core/                         # DOMINIO — cero dependencias externas
│   ├── entities/
│   │   ├── User.ts
│   │   ├── Route.ts              # Entidad principal de ruta
│   │   ├── Waypoint.ts           # Punto de interés
│   │   └── GpsPoint.ts           # Coordenada GPS con metadatos
│   ├── value-objects/
│   │   ├── Coordinates.ts        # lat/lon/elevation
│   │   ├── Distance.ts           # metros, km formateados
│   │   ├── Duration.ts           # segundos, formateado hh:mm:ss
│   │   ├── Speed.ts              # km/h, m/s
│   │   ├── Elevation.ts          # Ganancia/pérdida de elevación
│   │   └── Difficulty.ts         # Enum: easy | moderate | hard
│   ├── errors/
│   │   ├── DomainError.ts
│   │   ├── AuthError.ts
│   │   ├── GpsError.ts
│   │   └── SyncError.ts
│   ├── ports/
│   │   ├── repositories/
│   │   │   ├── IAuthRepository.ts
│   │   │   ├── IRouteRepository.ts     # CRUD rutas (online + offline)
│   │   │   └── IWaypointRepository.ts
│   │   └── services/
│   │       ├── IGpsService.ts          # Tracking GPS
│   │       ├── IStorageService.ts      # Archivos locales
│   │       ├── IExportService.ts       # GPX / KML / KMZ
│   │       └── ISyncService.ts         # Sincronización offline→online
│   └── rules/
│       ├── RouteRules.ts              # Validaciones de ruta
│       └── StatsCalculator.ts         # Cálculo de distancia, elevación, etc.
│
├── application/                  # CASOS DE USO
│   ├── auth/
│   │   ├── LoginUseCase.ts
│   │   ├── LoginWithGoogleUseCase.ts
│   │   ├── RegisterUseCase.ts
│   │   └── LogoutUseCase.ts
│   ├── tracking/
│   │   ├── StartTrackingUseCase.ts     # Inicia grabación GPS
│   │   ├── StopTrackingUseCase.ts      # Finaliza y calcula stats
│   │   ├── PauseTrackingUseCase.ts
│   │   ├── ResumeTrackingUseCase.ts
│   │   ├── AddWaypointUseCase.ts
│   │   └── GetLiveStatsUseCase.ts      # Stats en tiempo real
│   ├── routes/
│   │   ├── GetRoutesUseCase.ts
│   │   ├── GetRouteDetailUseCase.ts
│   │   ├── DeleteRouteUseCase.ts
│   │   └── SyncOfflineRoutesUseCase.ts # Sube rutas grabadas offline
│   └── export/
│       ├── ExportGpxUseCase.ts
│       ├── ExportKmlUseCase.ts
│       └── ExportKmzUseCase.ts
│
├── infrastructure/               # ADAPTADORES
│   ├── supabase/
│   │   ├── supabaseClient.ts     # Cliente Supabase configurado
│   │   └── dtos/                 # Shapes de la DB
│   ├── repositories/
│   │   ├── AuthRepositoryImpl.ts        # Supabase Auth
│   │   ├── RouteRepositoryImpl.ts       # Supabase + SQLite (offline-first)
│   │   └── WaypointRepositoryImpl.ts
│   ├── services/
│   │   ├── GpsServiceImpl.ts            # expo-location
│   │   ├── StorageServiceImpl.ts        # expo-file-system
│   │   ├── ExportServiceImpl.ts         # GPX/KML/KMZ generators
│   │   └── SyncServiceImpl.ts           # Lógica offline→online
│   ├── database/
│   │   ├── sqliteDb.ts                  # expo-sqlite setup
│   │   └── migrations/                  # Migraciones de esquema local
│   ├── mappers/
│   │   ├── RouteMapper.ts
│   │   ├── WaypointMapper.ts
│   │   └── GpsPointMapper.ts
│   └── config/
│       ├── env.ts                       # Variables de entorno tipadas
│       └── constants.ts                 # Thunderforest API key, etc.
│
├── presentation/                 # UI
│   ├── components/
│   │   ├── ui/                   # Design system (basado en diseño Pencil)
│   │   │   ├── Button.tsx        # Primary / Secondary
│   │   │   ├── Input.tsx
│   │   │   ├── Badge.tsx         # Dificultad
│   │   │   ├── Chip.tsx          # Active / Inactive
│   │   │   ├── RouteCard.tsx
│   │   │   ├── TabBar.tsx
│   │   │   ├── Modal.tsx
│   │   │   └── StatItem.tsx      # Item de estadística (icono + valor)
│   │   ├── map/
│   │   │   ├── TrackingMap.tsx   # MapLibre con ruta en tiempo real
│   │   │   ├── RoutePolyline.tsx # Línea de la ruta en el mapa
│   │   │   └── WaypointMarker.tsx
│   │   ├── tracking/
│   │   │   ├── LiveStatsPanel.tsx       # Panel superior con stats live
│   │   │   ├── TrackingControls.tsx     # Botones pause/stop/waypoint
│   │   │   └── GpsIndicator.tsx         # Indicador señal GPS
│   │   └── routes/
│   │       ├── RouteList.tsx
│   │       └── RouteSummaryCard.tsx
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useTracking.ts        # Hook principal de grabación GPS
│   │   ├── useLiveStats.ts       # Stats actualizadas en tiempo real
│   │   ├── useNetworkStatus.ts   # Online/offline detection
│   │   └── useRoutes.ts
│   ├── stores/                   # Zustand
│   │   ├── authStore.ts
│   │   ├── trackingStore.ts      # Estado de la grabación activa
│   │   ├── routesStore.ts
│   │   └── uiStore.ts            # Toasts, modals, loading
│   └── theme/
│       ├── colors.ts             # Tokens del diseño Pencil
│       └── tailwind.config.js    # NativeWind config
│
├── shared/
│   ├── types/
│   │   ├── Result.ts             # Result<T, E> monad
│   │   └── AsyncState.ts
│   ├── utils/
│   │   ├── formatDistance.ts     # "1.2 km" / "450 m"
│   │   ├── formatDuration.ts     # "1h 23m 45s"
│   │   ├── formatSpeed.ts        # "4.5 km/h"
│   │   ├── formatElevation.ts    # "+340 m / -120 m"
│   │   └── logger.ts
│   └── constants/
│       └── queryKeys.ts
│
└── di/                           # Inyección de Dependencias
    ├── container.ts
    └── providers.tsx
```

---

## 🗄️ Esquema de Base de Datos (Supabase)

```sql
-- Usuarios (gestionado por Supabase Auth)

-- Rutas
routes (
  id UUID PK,
  user_id UUID FK → auth.users,
  name TEXT,
  description TEXT,
  difficulty TEXT, -- 'easy' | 'moderate' | 'hard'
  distance_meters FLOAT,
  duration_seconds INT,
  elevation_gain_meters FLOAT,
  elevation_loss_meters FLOAT,
  max_elevation_meters FLOAT,
  avg_speed_kmh FLOAT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  is_public BOOLEAN DEFAULT false,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
)

-- Puntos GPS de la ruta
gps_points (
  id UUID PK,
  route_id UUID FK → routes,
  latitude FLOAT,
  longitude FLOAT,
  altitude FLOAT,
  accuracy FLOAT,
  speed FLOAT,
  recorded_at TIMESTAMPTZ,
  sequence_index INT
)

-- Waypoints
waypoints (
  id UUID PK,
  route_id UUID FK → routes,
  latitude FLOAT,
  longitude FLOAT,
  altitude FLOAT,
  title TEXT,
  description TEXT,
  created_at TIMESTAMPTZ
)

-- Imágenes de waypoints
waypoint_images (
  id UUID PK,
  waypoint_id UUID FK → waypoints,
  storage_path TEXT,  -- Supabase Storage
  created_at TIMESTAMPTZ
)
```

---

## 📱 Funcionalidades Clave

### Grabación de Ruta
- [x] Diseño completado (Pencil)
- [ ] Tracking GPS background con `expo-location`
- [ ] Cálculo en tiempo real: distancia, velocidad, elevación
- [ ] Pausa/reanuda grabación
- [ ] Funciona sin internet (guarda en SQLite local)
- [ ] Auto-sincronización al recuperar conexión

### Waypoints
- [ ] Añadir waypoint durante grabación
- [ ] Título y descripción libre
- [ ] Adjuntar fotos (cámara o galería)
- [ ] Visualización en mapa como markers

### Estadísticas Finales
- [ ] Distancia total
- [ ] Duración (activo, sin pausas)
- [ ] Elevación: ganancia, pérdida, máxima
- [ ] Velocidad promedio y máxima
- [ ] Perfil de elevación (gráfico)

### Exportación
- [ ] **GPX** — Formato estándar GPS (compatible con Garmin, Strava, etc.)
- [ ] **KML** — Google Earth / Maps
- [ ] **KMZ** — KML comprimido con imágenes embebidas

### Autenticación
- [ ] Registro con email/contraseña (Supabase)
- [ ] Login con Google (Supabase OAuth)
- [ ] Persistencia de sesión (expo-secure-store)

### Mapa
- [ ] MapLibre GL con tiles Thunderforest Outdoors
- [ ] Ruta dibujada en tiempo real
- [ ] Marcadores de inicio/fin
- [ ] Marcadores de waypoints
- [ ] Funciona offline (tiles cacheados)

---

## ⚙️ Variables de Entorno (.env)

```env
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_THUNDERFOREST_API_KEY=
```

---

## 🚀 Configuración Inicial

```bash
# Crear proyecto Expo
npx create-expo-app@latest nan-kamay --template expo-template-blank-typescript

# Dependencias principales
npx expo install expo-location expo-sqlite expo-file-system expo-image-picker expo-secure-store

# MapLibre
npm install @maplibre/maplibre-react-native

# Supabase
npm install @supabase/supabase-js

# Estado y estilos
npm install zustand
npm install nativewind tailwindcss
npm install react-native-mmkv

# Utilidades
npm install axios jszip
npm install @shopify/react-native-skia  # Para gráfico de elevación
```

---

## 📊 Progreso

### Fase 1 — Setup y Autenticación
- [x] Diseño UI completado (Pencil)
- [x] CLAUDE.md creado
- [ ] Inicialización del proyecto Expo
- [ ] Configuración NativeWind + Tailwind
- [ ] Configuración Supabase (auth + db)
- [ ] Pantallas Login / Register
- [ ] Navegación básica (Expo Router)

### Fase 2 — Grabación GPS ✅
- [x] `GpsServiceImpl.ts` — expo-location foreground + background task (TaskManager)
- [x] `useTracking.ts` — Hook que conecta GPS → trackingStore
- [x] `useElapsedTime.ts` — Timer activo en tiempo real (intervalo 1s)
- [x] `TrackingMap.tsx` — MapLibre con tiles Thunderforest Outdoors
  - Ruta dibujada como LineString en tiempo real
  - Marcador inicio (verde), posición actual (verde con pulso naranja)
  - Marcadores de waypoints (amarillo)
  - Cámara sigue posición actual (followUser)
- [x] `RouteMap.tsx` — Mapa estático para ver rutas guardadas
- [x] `GpsIndicator.tsx` — Indicador de calidad de señal GPS (±Xm)
- [x] Pantalla `active.tsx` actualizada — GPS real + MapLibre integrados
- [x] Pantalla `pre-recording.tsx` — Solicita permisos GPS antes de iniciar

### Fase 3 — Persistencia y Sync ✅
- [x] Mappers: RouteMapper, GpsPointMapper, WaypointMapper (SQLite ↔ Entidad ↔ Supabase)
- [x] `RouteRepositoryImpl` — SQLite offline-first (save, getAll, getById, getGps, getWaypoints, delete, markAsSynced)
- [x] `ImageUploadService` — sube imágenes locales a Supabase Storage (base64)
- [x] `SyncServiceImpl` — sincroniza rutas offline → Supabase (upsert rutas + GPS + waypoints + imágenes)
- [x] `SaveRouteUseCase` — orquesta el guardado completo al finalizar
- [x] `GetRoutesUseCase`, `DeleteRouteUseCase`, `SyncOfflineRoutesUseCase`
- [x] `routesStore` (Zustand) — lista de rutas, fetch, delete, sync
- [x] `useNetworkStatus` hook — detecta online/offline con NetInfo, actualiza uiStore
- [x] `RouteCard` component — tarjeta con stats, badge de dificultad, indicador sync pendiente
- [x] `summary.tsx` — guardado real con SQLite + Supabase sync automático post-save
- [x] `HomeScreen` — lista rutas con FlatList, pull-to-refresh, auto-sync al volver online, barra offline
- [x] `supabase/schema.sql` — tablas, índices, RLS policies y Storage bucket listos para ejecutar

### Fase 4 — Exportación y Detalle de Ruta ✅
- [x] `IExportService` port + `ExportFormat` type
- [x] `ExportServiceImpl` — GPX (1.1), KML (2.2), KMZ (JSZip + imágenes embebidas) → `documentDirectory/exports/`
- [x] `ExportRouteUseCase` — carga ruta+GPS+waypoints de SQLite y llama al service
- [x] `ExportButtons` component — 3 botones (GPX/KML/KMZ) con loading individual + Share nativo
- [x] `routes/[id].tsx` — pantalla detalle de ruta con stats grid, mapa, waypoints, export
- [x] `summary.tsx` — botón exportar disponible tras guardar ruta

### Fase 5 — Polish ✅
- [x] `ToastContainer` — componente de notificaciones animadas (success/error/info) montado en root layout
- [x] Mapa de ruta en pantalla detalle (`routes/[id].tsx`) — RouteMap con bounds auto-fit
- [x] `ElevationChart` — perfil de elevación con barras coloreadas por altitud (degradé verde→naranja)
- [x] Perfil de elevación en pantalla resumen (`summary.tsx`)
- [x] **Vel. Máxima** añadida a stats grid en `summary.tsx` y `routes/[id].tsx`
- [x] **Tab Explorar** — lista rutas públicas de Supabase (`GetPublicRoutesUseCase`), offline-aware, pull-to-refresh
- [x] **Toggle "Hacer ruta pública"** en `summary.tsx` antes de guardar — pasa `isPublic` al `SaveRouteUseCase`
- [x] **Animaciones y transiciones (reanimated)** — `react-native-worklets` instalado, plugin habilitado en babel
  - `RouteCard`: entrada staggered por index (slide+fade+spring), scale al presionar (Pressable)
  - `GpsIndicator`: pulso animado del dot mientras graba (scale+opacity repeat)
  - `ToastContainer`: spring slide-down al aparecer, timing fade al dismiss (con `runOnJS`)
  - `OfflineBanner`: nuevo componente con slide-down/up animado según `visible`
  - `active.tsx`: paneles superior e inferior con fade+spring de entrada; `ControlButton` con scale spring al presionar
- [ ] Testing

---

## 🔑 Decisiones Técnicas Importantes

1. **Offline-first**: SQLite como fuente de verdad local. Supabase como sync remoto.
2. **Background GPS**: Usar `expo-location` con `LocationTaskName` para seguir grabando con pantalla apagada.
3. **Tiles offline**: Investigar tile caching en MapLibre para uso sin internet.
4. **GPX/KML**: Generación manual (no librería) para control total del formato.
5. **Imágenes**: Almacenar en Supabase Storage, referencia local en SQLite hasta sync.
6. **Elevación**: Usar datos del GPS (`altitude`). Para mayor precisión, considerar Open Elevation API.

---

## 📐 Convenciones del Proyecto

- Archivos: `PascalCase.tsx` para componentes, `camelCase.ts` para utilidades
- Imports absolutos desde `src/` (configurar en tsconfig)
- Commits: `feat:`, `fix:`, `refactor:`, `docs:`
- Ramas: `feat/nombre-feature`, `fix/nombre-bug`
- No lógica de negocio en componentes React — solo en UseCases y Stores
- Todos los textos en español (UI) con soporte futuro i18n
