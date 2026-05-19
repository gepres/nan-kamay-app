# Ñan Kamay

> *Ñan Kamay* (Quechua: "el camino de la mano") — App móvil React Native para grabar rutas de trekking y montaña con GPS, funcional **online y offline**.

App de senderismo: graba tu recorrido por GPS (foreground + background), añade waypoints con fotos, revisa estadísticas y perfil de elevación al finalizar, y exporta la ruta en GPX/KML/KMZ.

---

## ⚠️ Estado actual (2026-05-18)

| Área | Estado |
|------|--------|
| Grabación GPS + guardado local (SQLite) | ✅ Funcional |
| Exportación GPX / KML / KMZ | ✅ Funcional |
| **Sincronización a Supabase** | ✅ Corregida (UUID v4, 5 dificultades, RLS UPDATE) — **requiere aplicar `supabase/schema.sql`** |
| Persistencia de `activityType` y tipo de waypoint | ✅ Corregida (mappers + columnas) |
| Stop GPS · guard auth · errores sync · persistencia incremental + recuperación | ✅ Corregidos (A2 / A4 / M10 / A3) |
| Google OAuth · sync bidireccional (pull+delete) · imágenes idempotentes | ✅ Corregidos (A5 / A6 / A8) — A5 requiere config Supabase/Google |
| Lote 🟡 (stats O(1), formatters/XML seguros, KMZ imgs, limpieza exports, Kalman resume…) | ✅ Corregido |
| 🟡 final (minElevation, recientes waypoint, aviso tiles, perfil con stats, borrado cross-device) | ✅ Corregido |
| Deuda arquitectónica (presentación→infra, use-cases no-clase, DI) | ⏸️ Deferida a propósito — ver `ARCHITECTURE.md` §6 |

> **Base de datos compartida.** El proyecto apunta a una Supabase que aloja **otra plataforma** (comunidad de trekking). Ñan Kamay convive con prefijo `nk_` (tablas `nk_routes`, `nk_gps_points`, `nk_waypoints`, `nk_waypoint_images`) y **comparte el login** (`auth.users`). No toca las tablas de la otra plataforma.

👉 Detalle de lo corregido y lo pendiente: **[`docs/VALIDATION.md`](./docs/VALIDATION.md)**.

---

## Stack

| Capa | Tecnología |
|------|------------|
| Framework | Expo SDK 55 (React Native 0.83) + TypeScript |
| Routing | Expo Router (file-based, root en `src/app`) |
| Estilos | NativeWind (TailwindCSS v4) |
| Estado | Zustand |
| Backend | Supabase (PostgreSQL + Auth + Storage) |
| Mapas | MapLibre GL + tiles Thunderforest (9 estilos) |
| GPS | expo-location (foreground + background via TaskManager) |
| Notificaciones | expo-notifications (persistente con stats en vivo) |
| Storage local | expo-sqlite (rutas), react-native-mmkv, expo-secure-store (tokens) |
| Exportación | GPX / KML / KMZ (JSZip), manual sin librería |
| Animaciones | react-native-reanimated |

---

## Requisitos previos

- Node.js 20+
- Android Studio / SDK (para `expo run:android`) o un dispositivo físico con [Expo Dev Client](https://docs.expo.dev/develop/development-builds/introduction/)
- Cuenta de [Supabase](https://supabase.com) y API key de [Thunderforest](https://www.thunderforest.com/)
- EAS CLI (`npm i -g eas-cli`) para builds en la nube

> No funciona con Expo Go: usa módulos nativos (background location, MapLibre, SQLite). Requiere development build.

---

## Configuración

1. Instala dependencias:

   ```bash
   npm install
   ```

2. Crea `.env` en la raíz (el código lee **`EXPO_PUBLIC_SUPABASE_ANON_KEY`**, no `..._KEY`; acepta tanto la anon key JWT clásica como una *publishable key* `sb_publishable_...`):

   ```env
   EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...   # o eyJhbGc... (anon key clásica)
   EXPO_PUBLIC_THUNDERFOREST_API_KEY=tu_api_key
   ```

3. Aplica el esquema de Supabase: ejecuta `supabase/schema.sql` en *Supabase Dashboard → SQL Editor*. Es **idempotente**, crea solo tablas `nk_*` y el bucket `nk-waypoint-images`, y **no toca** las tablas de la otra plataforma que comparte la base. El bucket se crea solo; si tu rol no puede insertar en `storage.buckets`, créalo manualmente en *Storage → New bucket* con nombre `nk-waypoint-images` (público).

4. **Google OAuth (opcional, para el botón Google):** en *Auth → Providers → Google* habilítalo con tu Client ID/Secret de Google Cloud; en *Auth → URL Configuration → Redirect URLs* añade `nan-kamay://auth-callback`.

---

## Ejecución (desarrollo)

```bash
npx expo prebuild --clean      # regenera carpetas nativas
npx expo run:android           # compila e instala con hot reload
```

> Tras `expo prebuild --clean` hay que **restaurar `index.ts`** (entry point custom) y **eliminar `App.tsx`** si se regeneró. `index.ts` debe importar `GpsServiceImpl` antes que `expo-router/entry` para registrar el TaskManager. `package.json` apunta `"main": "./index.ts"`.

## Builds (EAS Cloud)

```bash
eas build --platform android --profile preview      # APK de prueba (internal)
eas build --platform android --profile production    # APK de producción
```

Perfiles en `eas.json`: `development` (dev client), `preview` y `production` (`buildType: apk`).

---

## Estructura del proyecto

```
index.ts                    # Entry point custom (registra TaskManager antes de Expo Router)
app.json / eas.json         # Config Expo + permisos nativos / perfiles de build
supabase/schema.sql         # Esquema Postgres + RLS + Storage (ejecutar en Supabase)
src/
├── app/                    # Pantallas (Expo Router): (auth), (tabs), tracking/, routes/
├── core/                   # Dominio: entities, value-objects, errors, ports, rules
├── application/            # Casos de uso (funciones): routes/, tracking/, export/
├── infrastructure/         # Adaptadores: supabase, repositories, services, mappers, database
├── presentation/           # UI: components, hooks, stores (Zustand), theme
└── shared/                 # utils, constants
docs/                       # Documentación técnica (flujos, validación)
```

Detalle completo y honesto de la arquitectura: **[`ARCHITECTURE.md`](./ARCHITECTURE.md)**.
Flujos con diagramas de secuencia: **[`docs/FLOWS.md`](./docs/FLOWS.md)**.

---

## Convenciones

- Componentes `PascalCase.tsx`, utilidades `camelCase.ts`.
- Imports absolutos: `@core/`, `@application/`, `@infrastructure/`, `@presentation/`, `@shared/`.
- Commits: `feat:`, `fix:`, `refactor:`, `docs:`. Ramas: `feat/...`, `fix/...`.
- Todos los textos de UI en español.
- Colores: usar siempre los tokens de `src/presentation/theme/colors.ts`, nunca hex hardcodeado.

---

**Autor:** gepres · **Plataforma objetivo:** Android (iOS configurado, sin probar)
