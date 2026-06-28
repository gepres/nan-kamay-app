# Roadmap por fases — Mejoras estilo Strava

> Plan de implementación de las propuestas 🔴/🟡/🟢 de [`STRAVA_ANALYSIS.md`](./STRAVA_ANALYSIS.md).
> Secuenciado por **valor × bajo-riesgo-primero × dependencias**. Cada fase es
> **entregable por sí sola** (se puede shippear y validar en campo).
> Los diseños ya existen en `pencil/trek-kamay.pen` (pantallas `PROP · …`).
> Creado 2026-06-03.

**Leyenda esfuerzo:** S (≤1 día) · M (2–4 días) · L (1–2 semanas).

> **Actualizado 2026-06-26 (validado contra el código).** Fases 1–4 **completas y validadas en dispositivo**. La **Fase 3 (offline)** se reimplementó con **PMTiles vector (Protomaps/OSM, ODbL)** — NO con el `OfflineManager.createPack`/Thunderforest del spike original (queda como histórico abajo); por eso la *licencia Thunderforest ya no aplica al offline*. El **planificador 4.2 (persistir, `is_planned`)** también está hecho. Lista real al día en §"Pendientes por implementar". Además se entregó el **editor de trazado post-grabación + CRUD de waypoint** (fuera del roadmap Strava; ver `ARCHITECTURE.md`/memoria).

---

## Fase 0 — Calidad de grabación ✅ (hecha)
Base sobre la que se apoya todo lo demás. Ya en `master` (commit `7aac406`).
- One Euro (suavizado horizontal) + `MIN_DISPLACEMENT` 3→5 (`GpsFilter.ts`).
- Douglas-Peucker anti-serpenteo al dibujar (`geometry.simplifyLngLat`).
- Orden de timestamps en background (`GpsServiceImpl.ts`).
- Protocolo de pruebas (`docs/GPS_FIELD_TESTS.md`).

---

## Fase 1 — "Tu progreso" (analítica local) ✅ HECHA · commits `1c7a494`→`046c6b4`
**Por qué primero:** máximo valor percibido con el menor riesgo. Es **solo lectura**
sobre datos que ya existen en SQLite — sin backend, sin permisos, sin nativo.

**Entregado:**
- [x] 1.1 Perfil de elevación interactivo (`InteractiveElevationChart`, scrub↔mapa) — `1c7a494`
- [x] 1.2 Capa de métricas pura (`computeMetrics`) + hook `usePersonalMetrics` — `c2448c3`
- [x] 1.3 Perfil: récords + mapa de calor personal + recap (`PersonalHeatmap`, `getAllTrackPolylines`) — `77ee988`
- [x] 1.4 Pantalla Progreso (`/metrics/progress`: período/barras/donut/constancia) — `40f6124`
- [x] 1.5 Pantalla Lugares/Zonas (`/metrics/places`, `computeZones`, `ClusterMap`) — `046c6b4`

**Alcance:**
- **Perfil de elevación interactivo** (detalle): scrub en el gráfico que resalta el
  punto en el mapa + tooltip (dist/elev/tiempo). Reusa el motor de scrubbing del replay.
- **Récords personales**: ruta más larga, mayor desnivel, racha.
- **Mapa de calor personal**: superponer todas tus trazas.
- **Resumen anual (recap)**.
- **Métricas/Progreso**: totales por semana/mes/año + barras + reparto por actividad (donut) + constancia.
- **Lugares/Zonas**: zonas más frecuentes (clúster geográfico) + lugares más visitados.

**Código / áreas:**
- `src/core/rules/StatsCalculator.ts` (o nuevo `src/application/metrics/`): agregaciones
  por periodo, récords, clustering de zonas (rejilla/radio sobre `nk_routes`/`nk_waypoints`).
- `src/presentation/components/routes/ElevationChart.tsx` → versión interactiva (scrub).
- `src/app/(tabs)/profile.tsx` → secciones de récords/heatmap/recap, o nueva tab "Progreso".
- `src/app/routes/[id].tsx` → enganchar el scrub elevación↔mapa.
- Reusa `RouteMap`/MapLibre para el heatmap (varias `ShapeSource`).

**Diseño Pencil:** `PROP · Detalle · Elevación interactiva`, `PROP · Perfil · Récords + Heatmap + Recap`, `PROP · Métricas / Progreso`, `PROP · Métricas · Lugares / Zonas`.

**Criterios de aceptación:**
- Arrastrar el gráfico mueve un marcador en el mapa y actualiza el tooltip.
- Récords/recap/zonas se calculan de SQLite y coinciden con un cálculo manual sobre 2-3 rutas.
- Todo funciona **offline**.

---

## Fase 2 — "Grabación pro" (splits + auto-pausa + audio) ✅ HECHA · commits `0482a39`, `5bf9716`
**Por qué aquí:** mejora el core de grabación, self-contained, sin backend. Datos ya en `gps_points`.

**Entregado:**
- [x] 2.1 Parciales por km (`computeSplits` + `SplitsTable` en el detalle) — `0482a39`
- [x] 2.2 Auto-pausa **clock-only** (congela el reloj, NO deja de grabar; `activeElapsedSeconds`) — `5bf9716`
- [x] 2.3 Anuncios de audio por km (`expo-speech` diferido + toggle `audioCues`) — `5bf9716`
- ⚠️ Pendiente de **validar auto-pausa en campo** (riesgo medio): repetir test de reposo.
- ⚠️ `expo-speech` es nativo → requiere rebuild del APK.

**Alcance:**
- **Parciales por km** en vivo y en el detalle (ritmo/desnivel por km).
- **Auto-pausa**: detectar parada real (ya hay detección estacionaria en `GpsFilter`) y
  pausar/reanudar automáticamente, con indicador.
- **Anuncios de audio**: voz cada km/parcial (distancia, ritmo) con `expo-speech`.

**Código / áreas:**
- `src/presentation/hooks/useTracking.ts` + `trackingStore`: estado de splits, auto-pausa.
- `src/core/rules/StatsCalculator.ts`: cálculo incremental de parciales.
- `src/app/tracking/active.tsx`: UI de auto-pausa + tarjeta de parciales.
- `src/app/routes/[id].tsx`: tabla de parciales (colapsable).
- Nuevo: `expo-speech` para los anuncios (dependencia JS, requiere rebuild).

**Diseño Pencil:** `PROP · Grabación · Splits/Auto-pausa/Audio`.

**Criterios:** parciales correctos vs CSV de diagnóstico; auto-pausa no se dispara caminando lento (validar con las pruebas de campo); anuncios opcionales (toggle).

**Riesgo:** auto-pausa mal calibrada corta rutas (ya pasó histórico con `speed`). Validar con `docs/GPS_FIELD_TESTS.md`.

---

## Fase 3 — "Mapas offline" ✅ HECHA y validada en dispositivo (2026-06-26) — **PMTiles vector**
**Por qué crítica:** es lo más alineado con el dominio (montaña sin señal). Sin esto,
"seguir ruta" y "ver mapa" fallan donde más se necesitan.

**Enfoque final (reemplazó al spike de `createPack`):** mapas **vector PMTiles** (Protomaps/OSM,
ODbL). El `.pmtiles` local **ES** el dato offline (MapLibre nativo 11.12.1 lee `pmtiles://file://`),
sin `createPack` y **sin depender de Thunderforest para offline** → la **licencia Thunderforest ya
no aplica al offline** (online se mantiene raster Thunderforest). `OfflineTilesService` fue
**eliminado** y sustituido por `OfflineMapsService`.

**Entregado y validado en dispositivo (2026-06-26):**
- [x] `OfflineMapsService` (descarga `.pmtiles` + assets pack de fuentes/sprite + `manifest.json`; `buildVectorStyle`; `useBasemap`/`Basemap` conmutan online↔offline según `useNetworkStatus`).
- [x] Catálogo de **8 regiones** (Cusco centro/provincia, Valle Sagrado, Machu Picchu, Salkantay, Ausangate-Vinicunca, Colca, Huaraz). 3 en Supabase `nk-maps`; 5 en GitHub Releases `gepres/nan-kamay-maps` (tag `maps-v1`).
- [x] Pantalla `/map-offline` **didáctica**: buscador (geocoding Nominatim/OSM), mapa de previsualización con regiones tocables, sugeridas por cercanía (GPS), descarga con progreso y borrar; diagnóstico in-app (🐞) con botón **Copiar** (`expo-clipboard`).
- [x] **Render validado**: corregido el mapa **negro** (color via `namedTheme`) y los **glyphs** (fuentes sin espacios + auto-reparación del pack). Diagnóstico con buffer de logs MapLibre (`shared/utils/mapLogger.ts`). Ver memoria `offline-maps-pmtiles-direction`.
- [ ] (futuro) auto-extracción de **cualquier área** (servidor con go-pmtiles, u on-device) — hoy catálogo curado.

**Alcance:**
- Seleccionar una zona en el mapa (recuadro) y **descargar** los tiles para uso offline.
- Gestión de paquetes descargados (lista, tamaño, borrar).
- Uso transparente sin conexión.

**Código / áreas:**
- `@maplibre/maplibre-react-native` **OfflineManager / offline packs** (spike técnico:
  los packs offline trabajan sobre un *style JSON*; hoy usamos `RasterSource` Thunderforest
  directo → hay que envolver el raster en un style o cachear tiles manualmente).
- Nuevo `src/infrastructure/services/OfflineTilesService.ts` + estado de paquetes.
- `src/presentation/components/map/LayerSelectorModal.tsx` / nueva pantalla de descarga.
- `src/shared/constants/mapLayers.ts` + `env.thunderforestTileUrls`.

**Diseño Pencil:** `PROP · Descargar Mapa Offline`.

**Spikes/decisiones previas (hacer antes de estimar en firme):**
1. ¿Offline pack nativo de MapLibre con raster, o caché manual de tiles (FileSystem)?
2. **Licencia Thunderforest**: confirmar que el caché offline está permitido y sus límites.
3. Presupuesto de almacenamiento y política de borrado.

**Criterios:** descargar una zona, activar modo avión, abrir "Ver mapa" y que los tiles carguen.

---

## Fase 4 — "Planificador de ruta" 🟦 v1 HECHA
**Por qué después de offline:** se apoya en el mapa y complementa "Seguir ruta" (ya existe).

**Entregado (v1):**
- [x] Pantalla `/routes/plan`: tocar el mapa para añadir puntos, tocar un punto para quitarlo, deshacer/limpiar; distancia + tiempo estimado (4 km/h) + nº puntos.
- [x] **Seguir ahora**: pasa la guía dibujada (en memoria, `plannedRoute.ts`) a la pre-grabación (`?planned=1`) → reusa toda la infra de *Seguir Ruta* (banner de desvío, línea guía). Sin tocar el esquema.
- [x] Acceso desde Perfil → "Planificar ruta".
- [x] **4.2 persistir** la ruta planificada — HECHO: flag `is_planned` (columna SQLite + mapper + entidad), `savePlannedRoute`, pantalla `routes/planned.tsx` (lista) y acceso en Perfil. Excluida de métricas/listado.
- [ ] (futuro) *snap* a senderos; v1 usa tramos rectos. Ya existe snap por OSM en el **editor** (`OsmPathsService` "Pegar al mapa") → reusarlo aquí.

**Alcance:**
- Dibujar/editar una ruta tocando el mapa (añadir/mover/borrar puntos).
- Distancia/desnivel estimados; guardar como ruta; lanzar **Seguir ruta**.
- (Opcional/Fase posterior) *snap* a senderos — requiere routing externo; v1 puede ser tramos rectos.

**Código / áreas:**
- Nueva pantalla `src/app/routes/plan/index.tsx` (reusa patrón crosshair de `LocationPickerModal`
  y MapLibre).
- `RouteRepositoryImpl`: guardar ruta planificada (¿`is_draft`/flag `planned`?).
- Enlazar con `pre-recording?followFrom=<id>` (ya implementado).
- Desnivel estimado: DEM (`RefineElevationUseCase` ya consulta terreno).

**Diseño Pencil:** `PROP · Planificador de Ruta`.

**Criterios:** crear ruta de N puntos, guardarla, y seguirla con la guía existente.

---

## Fase 5 — "Seguridad" (ubicación en vivo / check-in) ✅ cliente hecho (2026-06-26)
**Por qué casi al final:** alto valor para trekking solo, pero es la más compleja
(backend + permisos + caso offline real).

> **Estado (2026-06-26):**
> - **PR1 — Check-in/S.O.S. por SMS** ✅ (validado en campo). `safety/` + `trustedContacts`
>   (AsyncStorage, solo en el dispositivo) + `buildLocationShare` (mejor fix + link de Maps).
>   Funciona **offline** (SMS por red de voz; GPS sin datos). Entrada en Perfil y atajo en grabación.
> - **PR2 — Seguimiento en vivo (link "sígueme"), in-app + Supabase** ✅. Tabla `nk_live_sessions`
>   (última posición in-place), RLS **solo-dueño** + RPC `nk_get_live_session(token)` **SECURITY
>   DEFINER** (capacidad por token, sin enumeración) + **trigger que fuerza el TTL de 12 h** en el
>   servidor. Emisor: toggle "Compartir en vivo" en la grabación → sube posición cada ~10 s
>   (`useTracking`) → comparte el enlace por el **mismo SMS de PR1**. Visor: **la misma app**
>   (`/seguir/[token]` + pantalla de pegar enlace `/seguir`), polling cada 10 s, mapa con punto vivo.
>   Pasó `security-review` (H1/M1/L2/L3 corregidos; rate-limit y token CSPRNG documentados como
>   endurecimiento futuro). Requiere **aplicar `supabase/schema.sql`**.
> - **PR3 — visor web (✅ hecho + validado 2026-06-28):** para contactos **sin** la app, el mismo App
>   Link `https://nankamay.trek-peru.com/seguir/<token>` cae al `404.astro` de la landing = visor en
>   vivo (Leaflet/OSM, polling del RPC cada 10 s con la publishable key/`anon`; `GRANT EXECUTE … TO
>   anon`). Marcador con `L.circleMarker` (SVG; un `divIcon`+clase CSS lo scopea Astro → invisible).
>   Pendiente menor: iOS Universal Links (falta Apple Team ID); accuracy/speed en el emisor; rate-limit.

**Alcance:**
- Compartir ubicación en vivo con contactos de confianza (link).
- **Fallback offline**: "enviar última posición por SMS" (clave: en montaña no hay datos).
- Gestión de contactos de confianza.

**Código / áreas:**
- Supabase: nueva tabla `nk_live_sessions` (+ punto vivo) con RLS y una vista/endpoint
  público para el link. Schema en `supabase/schema.sql`.
- Background location ya existe (`GpsServiceImpl`) → publicar posición periódica cuando hay red.
- `expo-sms` (SMS) + `expo-contacts` (opcional) + `Linking`.
- Nueva pantalla `src/app/safety/index.tsx`.

**Diseño Pencil:** `PROP · Seguridad · Ubicación en vivo`.

**Decisiones previas:** caducidad/seguridad del link; qué pasa sin señal (cola + reintento);
privacidad (RLS, expiración).

**Criterios:** un contacto abre el link y ve la posición; sin datos, el SMS sale con la última posición.

---

## Fase 6 — "Social ligero" (kudos + comentarios) 🟢 · esfuerzo M · riesgo MEDIO
**Por qué al final:** requiere backend social mínimo; valor menor para uso individual.
Solo sobre **rutas públicas** (Explore), sin grafo de seguidores ni feed.

**Alcance:**
- Kudos (like) y comentarios en rutas públicas.

**Código / áreas:**
- Supabase: `nk_route_kudos`, `nk_route_comments` + RLS (escritura autenticada, lectura pública).
- `src/app/routes/public/[id].tsx` + Explore: barra social + hilo + input.
- Use-cases en `src/application/routes/`.

**Diseño Pencil:** `PROP · Rutas públicas · Kudos + comentarios`.

**Criterios:** dar kudos y comentar una ruta pública; persiste y se ve desde otra cuenta.

---

## ⚪ Descartado (fuera de foco / infra pesada)
Segments/KOM/leaderboards, clubs, challenges, feed/follow completo, heatmap global,
rutas sugeridas por IA, mapas 3D. Requieren masa crítica de usuarios y/o datos masivos;
no aportan al producto individual offline-first. Reconsiderar solo si el producto pivota a social.

---

## Orden recomendado y dependencias
```
Fase 0 ✅ ── Fase 1 ✅ ── Fase 2 ✅
                  │
                  └── Fase 3 ✅ ── Fase 4 ✅
                                       │
                   Fase 5 (seguridad) ─┘   Fase 6 (social) [independiente]   ← SIGUIENTE
```
- **1 y 2** no dependen de nada → arrancar ya (riesgo bajo, valor alto).
- **3** habilita el uso real en montaña; **4** se apoya en el mapa.
- **5** y **6** necesitan backend (Supabase) → agruparlas si se toca el esquema.

## Notas transversales
- Cada fase con feature de grabación/GPS se valida con `docs/GPS_FIELD_TESTS.md`.
- Dependencias JS nativas nuevas (`expo-speech`, `expo-sms`, offline de MapLibre) → **rebuild** del APK.
- Mantener la **deuda arquitectónica deferida** (ver `ARCHITECTURE.md`); no es bloqueante.

---

## 📌 Pendientes por implementar (consolidado)

> **Validado contra el código el 2026-06-26.** Lo ya hecho se movió a "Cerrado recientemente".

### 🟡 Cliente (sin backend) — listos para implementar
- _(vacío — los tres pendientes 🟡 se cerraron el 2026-06-27; ver "Cerrado recientemente")_

### 🟢 Fases grandes (necesitan backend Supabase)
- [x] **Fase 5 — Seguridad / ubicación en vivo** — **cliente hecho (2026-06-26)**: PR1 (SMS check-in/S.O.S., offline) + PR2 (seguimiento en vivo in-app + Supabase: `nk_live_sessions`, RLS solo-dueño + RPC SECURITY DEFINER por token, TTL 12 h por trigger). **PR3 (visor web) hecho + validado 2026-06-28** (`404.astro` de la landing: Leaflet/OSM + polling del RPC con `anon`). Ver §Fase 5. Requiere aplicar `supabase/schema.sql`.
- [ ] **Fase 6 — Social ligero** — sin código aún (confirmado). Kudos + comentarios en rutas públicas; `nk_route_kudos`, `nk_route_comments` + RLS. Diseño Pencil listo.

### 🔴 Validación de campo (no es código)
- [ ] **GPS en reposo con señal pobre**: confirmar que el radio anti-deriva reduce el drift (~17 m junto a edificios). CSV de diagnóstico.
- [ ] **Auto-pausa**: confirmar que congela el reloj en paradas y no pierde puntos al caminar lento.

### ✅ Cerrado recientemente (2026-06-27)
- [x] **Detalle público → elevación interactiva** (2026-06-27): `routes/public/[id].tsx` ahora usa `InteractiveElevationChart` (scrub con tooltip + punto resaltado en el mini-mapa vía `highlight`), igual que el detalle privado. Los datos ya venían del `GetPublicRouteDetailUseCase`.
- [x] **Planificador — *snap* a senderos (OSM)** (2026-06-27): botón "Pegar a senderos (OSM)" en `routes/plan` que reusa `OsmPathsService.fetchPathsForBbox` + `snapCoordsToReference` (mismo motor del editor, tolerancia 25 m, conservador). Online-only; **reversible con Deshacer** (respaldo de un nivel). No es ruteo por grafo (mueve los puntos al sendero más cercano), suficiente para planificar.
- [x] **Métricas — nombres de zona (reverse-geocode) + desnivel por zona** (2026-06-27): `ReverseGeocodeService` (Nominatim, online, caché memoria+disco ~1 km, en serie por el límite de Nominatim) etiqueta cada zona con un lugar real, con **fallback** al nombre de la ruta más larga si no hay red. Además cada zona suma el **desnivel** de sus rutas (`elevationGainMeters`), DEM-preciso cuando la ruta se ajustó con `refineElevationUseCase` (que ya existe y está expuesto en el detalle privado). No se tocó el flujo de guardado (auto-DEM al guardar sigue diferido por riesgo).
- [x] **Observabilidad — bug report in-app + analítica de uso (in-house)** — **validado, schema aplicado (2026-06-26)**: decisión documentada (NO Google/Firebase por privacidad de app de ubicación + datos propios). `nk_bug_reports` + bucket privado `nk-bug-shots`; `nk_events` + `AnalyticsService` (cola offline + flush por lotes + opt-out) + `ScreenViewTracker` + ~8 eventos. **Dashboard: proyecto Astro propio** en `D:\projects\nan-kamay-dashboard` (SSR + Chart.js, rol solo-lectura `metabase_ro` vía Session pooler); Metabase como alternativa. Privacidad dura: sin GPS/PII, pantalla = patrón de segmento. Guía `docs/ANALYTICS.md`. **Heatmaps reales diferidos** (requieren grabar pantalla → privacidad). Pendiente solo: generar datos de uso real.
- [x] **Offline Fase 3 validado en dispositivo** (PMTiles vector; corregidos mapa negro y glyphs). Licencia Thunderforest **ya no aplica** al offline (Protomaps/OSM).
- [x] **Catálogo offline a 8 regiones** + pantalla **didáctica** (buscador/preview/sugeridas) + diagnóstico con **Copiar**. 5 regiones nuevas en GitHub Releases.
- [x] **Planificador 4.2 — persistir** (`is_planned` + `routes/planned`).
- [x] **Editor de trazado post-grabación + CRUD de waypoint** (agregar/editar/borrar) + guía visual al reubicar (fuera del roadmap Strava).
- [x] **Postal**: estilos de stats/elevación, mover elementos, nombre opcional.
- [x] **Ver mapa**: waypoints seleccionables.

### ⚪ Deuda / fuera de foco
- [ ] Deuda arquitectónica (presentación→infra, use-cases no-clase, DI) — deferida a propósito (`ARCHITECTURE.md` §6).
- [ ] Testing automatizado (no hay framework instalado).
- Descartado (no implementar salvo pivote a social): segments/KOM/leaderboards, clubs, challenges, feed/follow, heatmap global, rutas IA, mapas 3D.
