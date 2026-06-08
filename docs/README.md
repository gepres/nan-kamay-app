# Documentación — Ñan Kamay

Índice de la documentación técnica del proyecto.

| Documento | Contenido |
|-----------|-----------|
| [`../README.md`](../README.md) | Visión general, stack, setup, comandos de build/run |
| [`../ARCHITECTURE.md`](../ARCHITECTURE.md) | Arquitectura **real** del proyecto (capas, estructura, dónde se viola el patrón) |
| [`FLOWS.md`](./FLOWS.md) | Los flujos principales tal como están implementados, con diagramas de secuencia |
| [`VALIDATION.md`](./VALIDATION.md) | Informe de validación estática: bugs/gaps por severidad + plan de remediación |
| [`GPS_RECORDING_REVIEW.md`](./GPS_RECORDING_REVIEW.md) | Análisis del sistema de grabación GPS (filtro, Kalman, One Euro, RDP, background) |
| [`GPS_FIELD_TESTS.md`](./GPS_FIELD_TESTS.md) | Protocolo de pruebas de campo del GPS (CSV de diagnóstico). Capturas en `test-data/` |
| [`STRAVA_ANALYSIS.md`](./STRAVA_ANALYSIS.md) | Análisis de flujos de Strava y qué conviene implementar en Ñan Kamay |
| [`STRAVA_ROADMAP.md`](./STRAVA_ROADMAP.md) | Roadmap por fases de las mejoras estilo Strava + **pendientes por implementar** |
| [`../CLAUDE.md`](../CLAUDE.md) | Guía del proyecto para Claude Code (decisiones técnicas, convenciones) |

## Resumen del estado (2026-05-18)

- **Base de datos compartida**: Supabase aloja otra plataforma; Ñan Kamay convive con prefijo `nk_` y comparte `auth.users` (login común).
- **Offline-first operativo**: grabar, guardar local (SQLite), ver detalle y exportar GPX/KML/KMZ funcionan.
- **Sincronización: corregida** (UUID v4, 5 dificultades, RLS UPDATE, tablas `nk_`). Requiere aplicar `../supabase/schema.sql`. Ver banner en `VALIDATION.md`.
- **Persistencia de `activityType` y tipo de waypoint: corregida** (mappers + columnas + migración).
- **Corregido (2026-05-18)**: A2 (stop GPS), A4 (guard auth), M10 (errores sync visibles), A3 (persistencia incremental + recuperación), A5 (Google OAuth — requiere config Supabase/Google), A6 (sync bidireccional pull + borrado remoto), A8 (imágenes idempotentes).
- **Lote 🟡 corregido (2026-05-18)**: M3 (stats incremental O(1)), M7 (formatters defensivos), M6 (XML seguro), M5 (KMZ imágenes referenciadas+resiliente), M11 (limpieza exports), M2 (reset completo), M8 (explore recarga), M4 (Kalman resume + startTracking idempotente), M15 (código muerto).
- **🟡 final corregido (2026-05-18)**: M16 (persistir minElevation), M12 (recientes de waypoint), M14 (aviso de API key de tiles), M17 (perfil con stats agregadas), A6-ext (borrado cross-device + cleanup de Storage).
- **Pendiente**: solo deuda arquitectónica (presentación→infra, use-cases no-clase, DI), **deferida a propósito** — refactor amplio sin ganancia funcional. Ver `ARCHITECTURE.md` §6.
- **Arquitectura**: el código no implementa la Clean/Hexagonal que la documentación afirmaba; `ARCHITECTURE.md` refleja la realidad.

## Trabajo reciente (2026-06)

- **Calidad de grabación GPS** — suavizado **One Euro** (lat/lon) + **Douglas-Peucker** (anti-serpenteo al dibujar) + **orden de timestamps en background** + **precalentado/gate de señal en pre-grabación** + **siembra del filtro** + **radio anti-deriva por precisión** + **auto-pausa** (congela el reloj sin dejar de grabar) + **anuncios de audio por km**. Detalle y datos: `GPS_RECORDING_REVIEW.md` y `GPS_FIELD_TESTS.md`.
- **Mejoras estilo Strava** (ver `STRAVA_ROADMAP.md`):
  - **Fase 1 (analítica local)** ✅ — elevación interactiva, capa de métricas, perfil (récords + heatmap + recap), pantalla Progreso, pantalla Lugares/Zonas.
  - **Fase 2 (grabación pro)** ✅ — parciales por km, auto-pausa, audio.
  - **Fase 3 (mapas offline)** 🟦 v1 — descarga de tiles (a validar en dispositivo; ⚠️ revisar licencia Thunderforest).
  - **Fase 4 (planificador de ruta)** 🟦 v1 — dibujar y "seguir ahora".
  - **Pendientes**: Fase 5 (seguridad), Fase 6 (social) + items de v2 → ver §"Pendientes" en `STRAVA_ROADMAP.md`.

Empieza por [`VALIDATION.md`](./VALIDATION.md) si vas a corregir bugs, por [`FLOWS.md`](./FLOWS.md) si vas a entender cómo funciona la app, o por [`STRAVA_ROADMAP.md`](./STRAVA_ROADMAP.md) si vas a seguir con features.
