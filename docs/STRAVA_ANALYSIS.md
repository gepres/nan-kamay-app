# Análisis Strava → Ñan Kamay

> Investigación de los flujos de Strava (funcionalidad + UX/UI) y validación de
> cuáles conviene implementar en Ñan Kamay, cruzado con el estado **real** del
> código. Creado 2026-06-02.

---

## 1. Contexto para validar (qué ES Ñan Kamay)

No es un clon de Strava. Es un grabador **offline-first** de rutas de
**trekking/montaña**, de uso **individual**, sin grafo social, sobre una BD
Supabase **compartida** con otra plataforma (prefijo `nk_`). Tiene dos cosas que
Strava no logra tan bien:

- **Replay cinematográfico** (`src/app/routes/replay/[id].tsx`).
- **Postal** compartible (transparente / foto de fondo / sólida) —
  `src/presentation/components/routes/RoutePostalCard.tsx` + `routes/postal/[id]`.

Eso cambia qué vale la pena copiar: la fortaleza de Ñan Kamay está en
**grabar + revivir + compartir**, no en lo social.

---

## 2. Mapa de flujos de Strava (por área + UX)

| Área | Qué hace Strava | Patrón UX/UI clave |
|---|---|---|
| **Record** | Selección de deporte, stats en vivo + mapa **simultáneos**, auto-pausa, anuncios de audio (splits), Live Segments | Botón central de grabar en la nav; stats y mapa sin cambiar de pantalla |
| **Save Activity** | Pantalla post-actividad: título, descripción, deporte, privacidad, fotos, esfuerzo percibido, equipo | Una sola pantalla para editar todo antes de "publicar" |
| **Activity detail** | Stats resumen + "Show more", **perfil de elevación interactivo** (arrastras y resalta el punto en el mapa), **splits/laps**, fotos, mapa | Scrub sincronizado mapa↔gráfico |
| **Routes/Planning** | Route Builder (dibujar en mapa, snap a senderos), rutas sugeridas por **Heatmap/IA**, descargar offline, **seguir ruta** (solo la línea, *sin* turn-by-turn) | Construcción en mapa; "seguir" = línea, tú te mantienes en ella |
| **Maps/Heatmap** | Heatmap global y personal, 3D, múltiples estilos | Capas + visualización de "dónde ha ido la gente" |
| **Social** | Follow, feed, **kudos**, comentarios, clubs, challenges, leaderboards, **segments KOM/QOM** | Feed estilo Instagram, gamificación |
| **Sharing** | Compartir actividad como **imagen/story** (tarjeta sobre foto, overlay transparente), enlaces, video | Plantillas de share, overlay sobre tus fotos |
| **Safety** | **Beacon**: compartir ubicación en vivo con contactos | Link en vivo a contactos de confianza |
| **Gamificación** | Badges, trofeos, challenges, **recap anual** | Logros y récords personales |

---

## 3. Validación contra el código real

| Flujo Strava | Estado en Ñan Kamay | Veredicto |
|---|---|---|
| Grabar (mapa+stats en vivo, background) | ✅ Ya existe (`tracking/active`, notificación, filtro 5 etapas) | Mantener |
| Save Activity screen | ✅ `tracking/summary` + editar metadata | Mantener / pulir |
| Seguir ruta (línea, sin turn-by-turn) | ✅ `pre-recording?followFrom` + guía en `TrackingMap` | Ya alineado con Strava |
| Export GPX/KML/KMZ | ✅ + CSV diagnóstico | Mantener |
| Detalle con stats + elevación + mapa | ✅ + DEM refine + mapa interactivo + replay | Mantener |
| Compartir como imagen/story | ✅ **Postal** (transparente + foto de fondo) + **replay** | Ñan Kamay ya es **más fuerte** aquí |
| Capas de mapa | ✅ 9 estilos Thunderforest | Mantener |
| **Splits/laps + auto-pausa + audio km** | ⚠️ Parcial (hay detección estacionaria interna en `GpsFilter`) | **Implementar** |
| **Perfil de elevación interactivo** (scrub↔mapa) | ⚠️ Gráfico estático; el scrubber existe en replay | **Implementar** (reusar scrubber) |
| **Tiles offline** (descargar zona) | ❌ Pendiente conocido | **Implementar — crítico** (montaña = sin señal) |
| **Planificador de ruta** (dibujar antes de salir) | ❌ | **Implementar** (alto valor en trekking) |
| **Seguridad / ubicación en vivo** (Beacon) | ❌ | **Implementar** (alto valor; solo en montaña) |
| Heatmap personal + récords + recap anual | ❌ (perfil tiene stats agregadas básicas) | **Pronto** (sin backend social) |
| Kudos / comentarios en rutas públicas | ❌ | **Después** (versión ligera sobre Supabase) |
| Feed / follow | ❌ | Diferir |
| Segments / KOM / leaderboards / clubs / challenges | ❌ | **Descartar** (necesita masa crítica + infra pesada, fuera de foco) |
| Heatmap global / rutas IA / mapas 3D | ❌ | **Descartar** (requiere datos masivos) |

---

## 4. Roadmap priorizado (recomendación)

### 🔴 Implementar (encajan con el dominio offline + montaña)
1. **Tiles offline** — descargar una zona del mapa antes de salir. Lo más
   alineado con "offline-first + montaña sin señal". Sin esto, "seguir ruta"
   falla justo donde más se necesita.
2. **Planificador de ruta** — dibujar/editar una ruta en el mapa antes de grabar
   (reusa MapLibre + el patrón crosshair de `LocationPickerModal`). Complementa
   "Seguir ruta".
3. **Seguridad / compartir ubicación en vivo (Beacon-lite)** — para trekking en
   solitario. Caveat real: sin señal no hay tiempo real; viable como "compartir
   link de última posición / check-in por SMS".
4. **Splits por km + auto-pausa + anuncios de audio** — mejora el core de
   grabación con bajo costo (datos ya están en `gps_points`).

### 🟡 Pronto (motivacional, sin backend social)
5. **Perfil de elevación interactivo** en el detalle (arrastrar → resalta
   posición en el mapa; reusa el scrubber del replay).
6. **Récords personales + heatmap personal + recap anual** — sobre tus propias
   rutas, sin grafo social.

### 🟢 Después / ligero
7. **Kudos + comentarios en rutas públicas** (Explore) — capa social mínima
   sobre Supabase, sin "follow/feed".

### ⚪ Descartar (fuera de foco / infra pesada)
- Segments/KOM/leaderboards, clubs, challenges, feed/follow completo, heatmap
  global, rutas IA, mapas 3D.

---

## 5. Patrones UX/UI concretos a adoptar

- **Detalle de actividad interactivo:** scrub en el gráfico de elevación que
  resalta el punto en el mapa (ya tienes el motor en el replay).
- **Stats "Show more":** resumen compacto + expandir a detalle (hoy se muestra
  todo de golpe en `routes/[id]`).
- **Nav con Record central:** botón de grabar destacado en la tab bar.
- **Tabla de splits/laps** colapsable bajo el mapa.

---

## 6. Conclusión

Las áreas de **share** ya están cubiertas mejor que Strava (postal + replay). El
mayor diferencial pendiente para el dominio de Ñan Kamay es
**tiles offline + planificador + seguridad**, no lo social. Lo social pesado
(segments, clubs, feed) se descarta por falta de masa crítica y por estar fuera
del foco del producto.

---

## Fuentes

- [Strava Launches Redesigned Record Experience](https://press.strava.com/articles/strava-launches-redesigned-record-experience)
- [Strava Unveils Suite of New Subscriber Features](https://press.strava.com/articles/strava-unveils-suite-of-new-subscriber-features)
- [Creating Routes on Mobile (Strava Support)](https://support.strava.com/hc/en-us/articles/18001474720397-Creating-Routes-on-Mobile)
- [Following a Route (Strava Support)](https://support.strava.com/hc/en-us/articles/360044071592-Following-a-Route)
- [Run Activity Pages (Strava Support)](https://support.strava.com/hc/en-us/articles/216919567-Run-Activity-Pages)
- [Activity Split Tool (Strava Support)](https://support.strava.com/hc/en-us/articles/221033867-Activity-Split-Tool)
- [What is Kudos (Strava Support)](https://support.strava.com/hc/en-us/articles/216918397-What-is-Kudos)
- [Strava UX flows (Page Flows)](https://pageflows.com/ios/products/strava/)
- [Strava (Wikipedia)](https://en.wikipedia.org/wiki/Strava)
