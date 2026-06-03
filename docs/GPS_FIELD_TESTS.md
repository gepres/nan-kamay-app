# Pruebas de campo — Grabación GPS

> Protocolo manual para validar la grabación de rutas (no son tests automatizados).
> Cada prueba produce un **CSV de diagnóstico** que se analiza para detectar
> sobre/sub-filtrado, deriva en reposo y huecos en background.
> Complementa el análisis de [`GPS_RECORDING_REVIEW.md`](./GPS_RECORDING_REVIEW.md).

---

## Cómo ejecutar y guardar

1. Graba la ruta de la prueba en el dispositivo real (no emulador).
2. Al finalizar, abre la ruta en **Route Detail → Exportar → Diagnóstico (CSV)**
   (`ExportButtons` → formato `csv`). Genera `*-diagnostico.csv`.
3. Guarda el archivo en **`docs/test-data/`** siguiendo la convención existente:
   - `Test 1 — caminata recta.csv`
   - `Test 2 — reposo (deriva).csv`
   - `Test 3 — loop cerrado.csv`
   - `Test 4 — background pantalla apagada.csv`
4. Anota en este doc (o junto al archivo) el **dato real observado** para contrastar.

### Columnas del CSV
`seq, recorded_at, dt_s, lat, lon, dist_m, seg_speed_kmh, gps_speed_ms, gps_speed_kmh, altitude_m, accuracy_m`

- `dist_m` / `seg_speed_kmh` → lo que **calculó la app** entre puntos (post-filtro).
- `gps_speed_*` → velocidad cruda del GPS.
- `accuracy_m` → precisión; muchos valores > 25 m indican que el gate dejó pasar ruido.

---

## Pruebas

### 1. Caminata recta conocida (la más importante)
- Camina ~200–300 m **en línea recta** por una calle, a paso normal.
- **Anota:** distancia real aproximada (cuenta cuadras o usa Google Maps satélite
  después) y tiempo aproximado.
- **Valida:** `dist_m` acumulado vs. distancia real → filtro de desplazamiento
  mínimo (8 m) y anti-teleport.

| Dato | Valor |
|------|-------|
| Distancia real | _(rellenar)_ |
| Tiempo | _(rellenar)_ |
| Modo | a pie |

### 2. Parado quieto 2–3 minutos (test de deriva)
- Inicia grabación, deja el teléfono **quieto** en una mesa/banca 2–3 min, finaliza.
- **Esperado:** en reposo el track **no** debe acumular distancia.
- **Valida:** si `dist_m` suma metros estando quieto → la detección estacionaria
  no está anclando (causa típica de las "desconfiguraciones").

### 3. Vuelta a un punto (loop cerrado)
- Sal de un punto, da una vuelta a la manzana y **regresa al mismo punto exacto**.
- **Esperado:** inicio y fin casi pegados.
- **Valida:** drift acumulado.

### 4. Pantalla apagada / app en background
- Inicia, **bloquea la pantalla** y camina 3–5 min, reabre y finaliza.
- **Valida:** el tramo background escribe directo a SQLite **sin Kalman**.
  Revisar si `dt_s` se dispara (huecos) o si los puntos siguen llegando.

---

## Qué reenviar por cada prueba
1. El **CSV** (`*-diagnostico.csv`) en `docs/test-data/`.
2. Una línea de contexto: *"Prueba 1 — caminata recta, ~250 m reales, 4 min, a pie"*.
3. El **dato real** observado (distancia/tiempo) para contrastar.
