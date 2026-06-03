# Roadmap por fases — Mejoras estilo Strava

> Plan de implementación de las propuestas 🔴/🟡/🟢 de [`STRAVA_ANALYSIS.md`](./STRAVA_ANALYSIS.md).
> Secuenciado por **valor × bajo-riesgo-primero × dependencias**. Cada fase es
> **entregable por sí sola** (se puede shippear y validar en campo).
> Los diseños ya existen en `pencil/trek-kamay.pen` (pantallas `PROP · …`).
> Creado 2026-06-03.

**Leyenda esfuerzo:** S (≤1 día) · M (2–4 días) · L (1–2 semanas).

---

## Fase 0 — Calidad de grabación ✅ (hecha)
Base sobre la que se apoya todo lo demás. Ya en `master` (commit `7aac406`).
- One Euro (suavizado horizontal) + `MIN_DISPLACEMENT` 3→5 (`GpsFilter.ts`).
- Douglas-Peucker anti-serpenteo al dibujar (`geometry.simplifyLngLat`).
- Orden de timestamps en background (`GpsServiceImpl.ts`).
- Protocolo de pruebas (`docs/GPS_FIELD_TESTS.md`).

---

## Fase 1 — "Tu progreso" (analítica local) 🟡 · esfuerzo M · riesgo BAJO
**Por qué primero:** máximo valor percibido con el menor riesgo. Es **solo lectura**
sobre datos que ya existen en SQLite — sin backend, sin permisos, sin nativo.

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

## Fase 2 — "Grabación pro" (splits + auto-pausa + audio) 🔴 · esfuerzo M · riesgo MEDIO
**Por qué aquí:** mejora el core de grabación, self-contained, sin backend. Datos ya en `gps_points`.

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

## Fase 3 — "Mapas offline" (tiles) 🔴 · esfuerzo L · riesgo ALTO
**Por qué crítica:** es lo más alineado con el dominio (montaña sin señal). Sin esto,
"seguir ruta" y "ver mapa" fallan donde más se necesitan.

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

## Fase 4 — "Planificador de ruta" 🔴 · esfuerzo M · riesgo MEDIO
**Por qué después de offline:** se apoya en el mapa y complementa "Seguir ruta" (ya existe).

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

## Fase 5 — "Seguridad" (ubicación en vivo / check-in) 🔴 · esfuerzo L · riesgo ALTO
**Por qué casi al final:** alto valor para trekking solo, pero es la más compleja
(backend + permisos + caso offline real).

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
Fase 0 ✅ ── Fase 1 (analítica) ── Fase 2 (grabación pro)
                       │
                       └── Fase 3 (tiles offline) ── Fase 4 (planificador)
                                                          │
                                   Fase 5 (seguridad) ────┘   Fase 6 (social) [independiente]
```
- **1 y 2** no dependen de nada → arrancar ya (riesgo bajo, valor alto).
- **3** habilita el uso real en montaña; **4** se apoya en el mapa.
- **5** y **6** necesitan backend (Supabase) → agruparlas si se toca el esquema.

## Notas transversales
- Cada fase con feature de grabación/GPS se valida con `docs/GPS_FIELD_TESTS.md`.
- Dependencias JS nativas nuevas (`expo-speech`, `expo-sms`, offline de MapLibre) → **rebuild** del APK.
- Mantener la **deuda arquitectónica deferida** (ver `ARCHITECTURE.md`); no es bloqueante.
