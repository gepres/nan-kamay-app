# Documentación — Ñan Kamay

Índice de la documentación técnica del proyecto.

| Documento | Contenido |
|-----------|-----------|
| [`../README.md`](../README.md) | Visión general, stack, setup, comandos de build/run |
| [`../ARCHITECTURE.md`](../ARCHITECTURE.md) | Arquitectura **real** del proyecto (capas, estructura, dónde se viola el patrón) |
| [`FLOWS.md`](./FLOWS.md) | Los 4 flujos principales tal como están implementados, con diagramas de secuencia |
| [`VALIDATION.md`](./VALIDATION.md) | Informe de validación estática: bugs/gaps por severidad + plan de remediación |
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

Empieza por [`VALIDATION.md`](./VALIDATION.md) si vas a corregir bugs, o por [`FLOWS.md`](./FLOWS.md) si vas a entender cómo funciona la app.
