# Revisión del sistema de grabación GPS

**Fecha:** 2026-05-19
**Disparador:** prueba de campo en Cusco (3400 m) — el usuario reportó línea cortada, baja exactitud y zoom errático.
**Estado del código revisado:** post-fix de 2026-05-19 (commit aún sin pushear; cambios sobre `GpsFilter.ts`, `GpsServiceImpl.ts`, `TrackingMap.tsx`).

Este documento responde a una pregunta concreta: **¿la configuración y el algoritmo que estamos usando son los adecuados para una app que graba rutas de trekking?** Responde con honestidad: separa lo verificado contra literatura/proyectos similares, lo razonable pero no probado, y las deudas pendientes.

---

## 1. Resumen ejecutivo

| Área | Estado | Comentario |
|------|--------|------------|
| Pipeline de filtrado (`GpsFilter`) | 🟢 Mejorado | Bug crítico de detección estacionaria por `speed=null` corregido. Velocidad ahora calculada del desplazamiento. |
| Muestreo (`watchPositionAsync`) | 🟢 Adecuado | `distanceInterval=5 m`, `timeInterval=3 s`, `BestForNavigation` — alineado con prácticas de Strava/OpenTracks. |
| Background tracking | 🟡 Funcional con limitación | TaskManager + notificación propia (evita crash Android 12+), pero ruta headless es algo más ruidosa (sin Kalman). |
| Filtro Kalman 1D | 🟡 Razonable, no óptimo | `q=3e-5` mejora respuesta vs valor anterior (`5e-6`). La literatura prefiere Kalman adaptativo (acelerómetro + GPS); fuera de alcance hoy. |
| Cálculo de estadísticas | 🟢 Sólido | EMA (α=0.15) + dead-band (4 m) para elevación; gate de teleport 15 km/h. Mejor que muchas alternativas open-source. |
| Cámara y zoom | 🟢 Corregido | Auto-follow desacoplado del zoom; coincide con el workaround recomendado por la comunidad MapLibre RN. |
| Validación empírica | 🟠 Pendiente | Los nuevos valores se justifican técnicamente pero **solo una caminata real los confirma**. Sección 7 explica cómo medir. |
| Fusión con IMU/acelerómetro | 🔴 No implementado | Mejora significativa documentada en la literatura para peatones. Deuda futura. |
| Barómetro para elevación | 🔴 No implementado | La mayoría de Android modernos lo tienen; daría elevación mucho más precisa que GPS. Deuda futura. |

**Mensaje principal:** la configuración actual es **competitiva con apps open-source de trekking** (OpenTracks, GPSLogger) para el caso "grabación foreground en un Android moderno con cielo despejado". No alcanza el nivel de Strava (que añade post-procesamiento en servidor, fusión multi-sensor y mapas de inferencia), pero eso requiere infraestructura que Ñan Kamay no tiene hoy.

---

## 2. Métricas de campo (línea base)

Capturas reales en `kmz-test/` con el **filtro anterior** (anti-modelo):

| Archivo | Distancia reportada | Duración | Puntos | Densidad | Veredicto |
|---------|---------------------|----------|--------|----------|-----------|
| Camino a la lavandería.kmz | 50 m | 7 min | 6 | 1 pt / 8 m | ❌ Catastrófico |
| Mercado 2.kmz | 70 m | 17 min | 9 | 1 pt / 8 m | ❌ Catastrófico |
| Mercado.kmz | 200 m | 6 min | 23 | 1 pt / 9 m | 🟡 Aceptable |

Las dos primeras corresponden a caminatas reales mucho más largas que 50–70 m: el filtro estaba **descartando la caminata como si fuera drift estacionario**. Solo la tercera (movimiento sostenido sin pausas) se libró.

**Causa raíz confirmada en código:** `expo-location` reporta `coords.speed = 0` o `null` muy seguido caminando en Android (el GPS Doppler no siempre estima velocidad a paso humano). El filtro interpretaba eso como "parado" tras 3 lecturas, anclaba la posición y descartaba todo punto dentro de un radio de 25 m.

**Meta objetivo post-fix:** densidad de **1 pt cada 4–8 m** en caminata sostenida (~5 km/h) → ~100–200 puntos por kilómetro. Sección 7 describe el protocolo de validación.

---

## 3. Algoritmo actual: descripción y justificación

### 3.1 Pipeline de filtrado (`src/infrastructure/services/GpsFilter.ts`)

5 etapas en serie, **todas operando sobre el fix crudo del SO** salvo el desplazamiento mínimo (que mide sobre coords ya suavizadas):

```
fix crudo
   ↓ (1) gate de precisión: accuracy ≤ 30 m
   ↓ (2) anti-teleport: < 18 km/h entre fixes
   ↓ (3) detección estacionaria por velocidad CALCULADA
   ↓ (4) Kalman 1D (lat/lon independientes + alt)
   ↓ (5) desplazamiento mínimo: ≥ 4 m respecto al último aceptado
fix aceptado
```

| Parámetro | Valor | Justificación |
|-----------|-------|---------------|
| `MAX_ACCURACY` | 30 m | Trekking en zona de montaña/bosque: GPS típico 8–25 m; el valor anterior (25 m) descartaba lecturas legítimas. Strava no documenta un valor público; GPSLogger permite configurarlo (≈25–50 m son comunes). |
| `STATIONARY_SPEED` | 0.4 m/s (~1.4 km/h) | Por debajo de caminata lenta normal (4–6 km/h). Crítico: ahora se compara contra **velocidad calculada del desplazamiento**, no contra `coords.speed` del SO (que es la entrada poco fiable que rompía todo). |
| `STATIONARY_READINGS` | 4 lecturas | Requiere ~12–20 s de no-movimiento antes de declarar "parado". Evita falsos positivos en semáforos cortos. |
| `DRIFT_RADIUS` | 12 m | Anterior 25 m era el doble del error GPS típico → comía caminatas reales. 12 m ≈ 2× ruido típico al aire libre. |
| `MIN_DISPLACEMENT` | 4 m | El `distanceInterval=5 m` del SO ya filtra grueso; este gate atrapa jitter post-Kalman menor. |
| `MAX_HIKING_SPEED_KMH` | 18 km/h | Margen sobre running rápido (16 km/h). Solo activo en intervalos < 60 s (no penaliza pausas largas). |
| Kalman `q` (lat/lon) | 3e-5 | Anterior 5e-6 era 6× más agresivo: el estimado quedaba muy detrás del movimiento real → recortaba esquinas y reducía el desplazamiento entre puntos hasta hacerlos caer en el gate mínimo. El nuevo valor da seguimiento más fiel. |
| Kalman `q` (alt) | 0.8 | Altitud GPS es ruidosa (±10–30 m fácilmente); la suavización aquí compensa, pero un barómetro daría mejor resultado (ver §6.3). |

### 3.2 Cálculo de estadísticas (`src/core/rules/StatsCalculator.ts`)

- **Distancia**: suma de segmentos haversine, descartando segmentos < 2 m (jitter) y > 15 km/h (teleport). 🟢 Aproximación estándar.
- **Elevación**: EMA con α=0.15 + dead-band de 4 m para gain/loss. 🟢 Esta es **mejor de lo que hace OpenTracks** (que no aplica smoothing por defecto y por eso Strava reporta mucho menos elevation gain — ver issue #457 del repo).
- **Velocidad media**: distancia / duración activa (excluyendo pausas). 🟢 Correcto.
- **Velocidad máxima**: del `coords.speed` del sensor, capada a 15 km/h. ⚠️ Inconsistencia menor con el filtro (que permite 18 km/h) — ver §6.1.

### 3.3 Configuración de muestreo (`src/infrastructure/services/GpsServiceImpl.ts`)

| Parámetro | Foreground | Background | Comentario |
|-----------|-----------|-----------|------------|
| `accuracy` | `BestForNavigation` | `BestForNavigation` | Activa GPS + sensor fusion. Confirmado como ideal para hiking apps por la doc de Expo. |
| `distanceInterval` | 5 m | 5 m | Anterior 10 m era demasiado grueso para senderos con curvas cerradas. |
| `timeInterval` | 3 s | 3 s | ⚠️ Issue conocido de expo-location (#10196): cuando se especifican ambos, `timeInterval` puede ser ignorado en favor de `distanceInterval` en algunos dispositivos. En la práctica, distancia domina. |
| `deferredUpdatesDistance` | — | 5 m | Solo background. |
| `pausesUpdatesAutomatically` | — | `false` | Crítico: si fuera `true`, iOS pausaría el GPS al detectar inmovilidad → perderíamos pausas reales del usuario. |
| `showsBackgroundLocationIndicator` | — | `true` | iOS: muestra el indicador azul (requisito de UX recomendado por Apple). |

---

## 4. Validación contra la industria

### 4.1 Comparación con apps de referencia

| App | Estrategia | Comparación con Ñan Kamay |
|-----|-----------|---------------------------|
| **Strava** | Smoothing en cliente + post-procesamiento en servidor (clustering, regresión lineal, ML sobre datos crowd-sourced) | Ñan Kamay tiene smoothing equivalente en cliente (Kalman + EMA elevación). No tiene post-procesamiento server-side: aceptable para v1, gap conocido. |
| **OpenTracks** (open-source, Android) | Filtrado básico por precisión + distancia. Sin Kalman ni smoothing de elevación por defecto (issue #457 sigue abierto). | Ñan Kamay tiene **más filtrado** (Kalman + EMA elevación) — paradójicamente nuestro problema era *demasiado* filtrado, no poco. |
| **Komoot** | Datos no públicos, pero perfiles de elevación reconocidamente bien suavizados | Comparable en estadísticas; Ñan Kamay aún no tiene "snap-to-trail" (proyectar la traza sobre senderos OSM conocidos). |
| **GPSLogger** (open-source) | Configuración expuesta al usuario (acc. mínima, intervalo, retry) | Ñan Kamay usa valores fijos; ver §6.4 (exponer al usuario). |

### 4.2 Validación de parámetros contra literatura

- **`distanceInterval = 5 m`**: dentro del rango común documentado para hiking apps (5–10 m). Valores menores incrementan ruido sin información útil; mayores pierden detalle en senderos sinuosos.
- **`MAX_ACCURACY = 30 m`**: Garmin/REI consideran que GPS recreativo moderno alcanza 3–5 m con cielo despejado y 5–10 m en condiciones reales; 30 m permite tolerar bosque/cañón sin descartar todo el tramo.
- **Kalman lineal 1D por eje**: la literatura (MDPI 2023, SAGE 2020) prefiere **Kalman adaptativo con fusión IMU** para peatones. Lo que tenemos es la versión simple — apropiada para v1, no estado del arte. Ver §6.3.
- **Detección estacionaria por desplazamiento (no por speed del SO)**: validado contra el bug observado. La literatura recomienda no confiar en `coords.speed` del SO en Android low-end. Decisión correcta.

### 4.3 Validación del fix de cámara

El problema "zoom buttons fight follow camera" es un **issue conocido en `@maplibre/maplibre-react-native`** (issues #530, #648, discussion #658). La solución recomendada por la comunidad es exactamente lo que aplicamos:

> *"A workaround involves setting the Camera.followUserLocation to a state and setting it to false when something like onTouchStart() triggers."*

Nuestro `suspendFollowUntil` de 6 s tras un zoom manual implementa esta idea sin requerir un toggle visible.

---

## 5. Observaciones (cosas que ya están bien hechas)

1. **Entry point custom (`index.ts`)** importa `GpsServiceImpl` antes de Expo Router para que `TaskManager.defineTask` se registre temprano. Esto es **correcto y necesario**; si se rompe, el background tracking dejaría de funcionar silenciosamente.
2. **Persistencia incremental en SQLite** con `is_draft = 1` y escritura directa desde el headless task asegura **cero pérdida de ruta** ante un kill del proceso. Pocas apps open-source manejan esto.
3. **No usamos `foregroundService` de expo-location** (causa crash en Android 12+); en su lugar `expo-notifications` con canal `LOW`. Decisión correcta y documentada en CLAUDE.md.
4. **`pausesUpdatesAutomatically: false`** explícito — evita el clásico bug iOS donde el sistema pausa el GPS al detectar inmovilidad y pierde el reinicio de caminata.
5. **`StatsCalculator` con acumulador O(1)** ya está optimizado (refactor previo M3). Importante para rutas largas (>1000 puntos).
6. **Anti-teleport tanto en filtro como en stats** — defensa en profundidad. Si un fix saltón pasara el filtro, las stats no se inflarían.
7. **MapLibre `RasterSource` con `key` dinámico** para forzar recarga al cambiar capa — workaround conocido y correcto.

---

## 6. Mejoras propuestas (priorizadas)

### P0 — Críticas (deberían entrar pronto)

#### 6.1 Unificar constantes entre `GpsFilter` y `StatsCalculator`
Hoy:
- `GpsFilter.MAX_HIKING_SPEED_KMH = 18`
- `StatsCalculator.MAX_SPEED_KMH = 15`
- `GpsFilter.MIN_DISPLACEMENT = 4 m`
- `StatsCalculator.MIN_SEGMENT = 2 m`

Inconsistencia: el filtro permite un segmento de 16 km/h, pero stats lo descarta → la línea se dibuja pero la distancia no cuenta. Mover los umbrales a `src/shared/constants/gpsTuning.ts` y compartir.

**Esfuerzo:** 30 min. **Riesgo:** ninguno.

#### 6.2 Test de regresión empírico contra los KMZ guardados
Los archivos en `kmz-test/` son la única evidencia de que el bug existió. Convertirlos en una fixture: dado el array de puntos crudos, el pipeline debe producir ≥ N puntos / m. Sin esto, una regresión futura podría volver al estado anterior sin que nadie note.

**Esfuerzo:** ~3 h (sin framework de tests hoy — primero hay que instalar Jest/Vitest).
**Riesgo:** bajo. **Bloqueador:** el proyecto no tiene tests aún (deuda conocida).

### P1 — Importantes (próximas iteraciones)

#### 6.3 Fusión con barómetro para elevación
La altitud GPS tiene ±10–30 m de error fácilmente. La mayoría de Android modernos (y todos los iPhone desde el 6) tienen barómetro. Expo expone `expo-sensors → Barometer`. Combinarlo con la altitud GPS daría perfiles de elevación **mucho más fieles** — esto es lo que hace Strava cuando reporta "elevation gain" tan superior a OpenTracks.

Aproximación práctica: usar el barómetro como fuente principal de **delta** de elevación entre puntos, y el GPS solo para calibrar la altitud absoluta inicial.

**Esfuerzo:** 1–2 días. **Riesgo:** medio (dispositivos sin barómetro deben degradar elegante).

#### 6.4 Kalman adaptativo con acelerómetro (peatonal)
La literatura (Chen et al. 2020, SAGE) muestra que un Kalman cuyo ruido de proceso `q` se ajusta con la **magnitud de aceleración** del usuario reduce significativamente el error en peatones. Cuando el usuario está parado (acel ≈ gravedad), `q` baja → suaviza más. Cuando se mueve, `q` sube → sigue mejor.

Esto resolvería el dilema actual entre "suave (corta esquinas)" y "responsivo (ruidoso parado)".

**Esfuerzo:** 2–3 días. **Riesgo:** medio. **Beneficio:** salto cualitativo.

#### 6.5 Exponer 2–3 parámetros al usuario
Como GPSLogger: dejar al usuario escoger entre presets ("Senderismo ahorrador" / "Senderismo preciso" / "Trail running") que cambien `distanceInterval`, `MAX_ACCURACY` y `MIN_DISPLACEMENT`. Hoy son fijos, lo cual obliga a escoger un compromiso que no funciona para todos los casos.

**Esfuerzo:** 1 día. **Riesgo:** bajo (UI + persistencia en MMKV).

### P2 — Mejoras futuras

#### 6.6 Snap-to-trail sobre OpenStreetMap
Para rutas conocidas (senderos OSM), proyectar la traza sobre el sendero real reduce ruido sin perder fidelidad. Esto es lo que hace Komoot. Requiere descargar tiles vectoriales OSM y un algoritmo de map-matching.

**Esfuerzo:** 1–2 semanas. **Riesgo:** alto. **Beneficio:** mejora visual notable.

#### 6.7 Post-procesamiento al finalizar
Cuando el usuario termina la ruta, recorrer la lista de puntos completa y aplicar un pase de smoothing más agresivo (Savitzky-Golay o Douglas-Peucker para simplificación). El track recortaría jitter residual que el pipeline en tiempo real deja pasar.

**Esfuerzo:** 1 día. **Riesgo:** bajo. **Beneficio:** estadística más limpia (sobre todo elevación) en summary.

#### 6.8 Detección de actividad (ActivityRecognition API)
Si el usuario se sube al teleférico o a un bus durante la ruta, el filtro lo descarta como teleport, pero el tramo "perdido" queda como hueco. Detectar el cambio de modalidad (a pie → vehículo) permitiría avisar al usuario en lugar de descartar silenciosamente.

**Esfuerzo:** 2 días. **Riesgo:** medio.

#### 6.9 EAS Update para hot-fix de tuning
Hoy cualquier cambio de constantes del filtro requiere rebuild EAS de ~15 min. Configurar `expo-updates` permitiría empujar ajustes de JS-only (como los de hoy) en segundos. Especialmente útil mientras los parámetros aún se están afinando.

**Esfuerzo:** 2 h. **Riesgo:** bajo.

---

## 7. Protocolo de validación de campo

Tras instalar el APK nuevo, esta es la prueba mínima que confirma que los fixes funcionan:

### 7.1 Caminata corta controlada (10–15 min)
1. Activa la app, inicia grabación en un lugar abierto.
2. Camina **una cuadra completa en rectángulo** (≈ 200–400 m, depende del barrio).
3. **Detente 1 minuto** en una esquina (semáforo simulado).
4. Sigue caminando otra cuadra.
5. **Para deliberadamente 30 s** a mitad de cuadra.
6. Termina la ruta y exporta a KMZ.

**Criterios de aceptación:**
- [ ] La línea **no se interrumpe** durante el movimiento (gap > 30 s sería bug).
- [ ] El contador "X pts" en pantalla sube ~1 punto cada 3–5 s mientras caminas.
- [ ] La distancia reportada está dentro de ±10% de la real (medible en Google Maps).
- [ ] En la pausa de 1 min, los pts se quedan quietos pero la traza **no acumula ruido visible** en el mapa.
- [ ] El KMZ exportado tiene **≥ 50 puntos** para una caminata de 10 min normal (vs los 6–9 del KMZ anterior).
- [ ] Tocar zoom + / – funciona y se mantiene 6 s antes de volver a centrar.

### 7.2 Comparación cuantitativa contra los KMZ viejos
```
caminatas viejas (filtro anterior):
  6 puntos / 7 min  → 0.86 pts/min
  9 puntos / 17 min → 0.53 pts/min

objetivo nuevo (caminata sostenida):
  ≥ 15 pts/min      (1 pt cada 4 s en ritmo normal)
```

Si tras una caminata sostenida (sin pausas largas) la densidad sigue siendo `< 5 pts/min`, hay regresión y hay que revisar.

### 7.3 Test de batería
La app antes consumía X% por hora con `distanceInterval=10 m` cada 5 s. Ahora con 5 m cada 3 s, la radio GPS está más activa. Espera **un aumento de ~10–20%** en consumo de batería. Si es mayor, considerar:
- Volver a `distanceInterval=7–8 m` si la densidad de puntos resulta excesiva.
- O subir `MIN_DISPLACEMENT` a 5 m.

Estos son trade-offs reales; ajustar después de medir.

---

## 8. Decisiones que NO se tomaron (y por qué)

Para ser honesto sobre qué quedó fuera deliberadamente:

| Decisión | Por qué se descartó hoy |
|----------|-------------------------|
| Cambiar a `FusedLocationProviderClient` raw (sin expo-location) | Ya lo usa internamente con `BestForNavigation`. No daría mejora apreciable y romperia portabilidad iOS. |
| Implementar Kalman 2D acoplado lat-lon | El 1D por eje es suficiente para el orden de error de un GPS de teléfono. El 2D con correlaciones requiere modelo de movimiento (constant velocity vs constant acceleration) — beneficio marginal vs complejidad. |
| Aumentar `STATIONARY_READINGS` a 6+ | Más conservador detectar pausas → más drift mostrado en pausas reales. El bug real era *otro* (la fuente de speed). |
| Eliminar la detección estacionaria por completo | Funcionalmente sería un regresión: en pausas largas el GPS sí acumula drift visible y los stats se inflan. Mejor *arreglarla* que removerla. |
| Subir `MAX_HIKING_SPEED_KMH` a 25+ | Eso desactivaría anti-teleport para trail running. 18 es generoso. |

---

## 9. Referencias

**Filtrado GPS y Kalman peatonal:**
- [Adaptive Kalman filtering-based pedestrian navigation algorithm for smartphones (SAGE 2020)](https://journals.sagepub.com/doi/full/10.1177/1729881420930934) — fundamento para §6.4.
- [Two-Step Robust Adaptive Cubature Kalman Filter (MDPI 2023)](https://www.mdpi.com/2072-666X/14/6/1252) — Kalman adaptativo aplicado a peatones.
- [Pedestrian Motion Tracking by Using Inertial Sensors on the Smartphone (arXiv 2009.08824)](https://arxiv.org/pdf/2009.08824)
- [How to Reduce GPS Data Errors on Android with Kalman Filter — Mad Devs](https://maddevs.io/blog/reduce-gps-data-error-on-android-with-kalman-filter-and-accelerometer/)

**Apps de referencia:**
- [Strava's GPS Data Processing Pipeline — Frugal Testing](https://frugaltesting.com/blog/stravas-gps-data-processing-pipeline-and-performance-testing)
- [OpenTracks GitHub (mirror)](https://github.com/OpenTracksApp/OpenTracks) — repo principal migró a Codeberg.
- [OpenTracks issue #457: GPS smoothing](https://github.com/OpenTracksApp/OpenTracks/issues/457) — confirma que OpenTracks NO hace smoothing por defecto.
- [GPSLogger for Android](https://gpslogger.app/) — configuración granular expuesta al usuario.

**MapLibre RN (cámara/zoom):**
- [Issue #530 — followUserLocation non-deterministic](https://github.com/maplibre/maplibre-react-native/issues/530)
- [Issue #648 / Discussion #658 — Can't explore map when followUserLocation set](https://github.com/maplibre/maplibre-react-native/issues/648)
- [Issue #1196 — defaultSettings vs controlled props](https://github.com/maplibre/maplibre-react-native/issues/1196)

**Expo / expo-location:**
- [Expo Location docs](https://docs.expo.dev/versions/latest/sdk/location/)
- [Issue #10196 — timeInterval ignorado cuando hay distanceInterval](https://github.com/expo/expo/issues/10196)
- [Building location-based features with Expo Location — Anthony Coffey](https://coffey.codes/articles/building-location-based-features-using-expo-location)

**GPS hardware y exactitud:**
- [Improving urban GPS accuracy for your app — Android Developers Blog](https://android-developers.googleblog.com/2020/12/improving-urban-gps-accuracy-for-your-app.html)
- [How to Choose & Use a GPS for Hiking — REI](https://www.rei.com/learn/expert-advice/gps-receiver.html)
- [Understanding GPS accuracy — Footpath](https://footpathapp.com/user-guide/gps-accuracy/)
- [Strava vs Komoot vs Ride with GPS: Elevation Gain Accuracy — HikingManual](https://www.hikingmanual.com/posts/strava-vs-komoot-vs-ride-with-gps-elevation-gain-accuracy/)

---

## Apéndice A — Cambios concretos aplicados hoy (2026-05-19)

Para trazabilidad, el diff conceptual aplicado en esta sesión:

```diff
GpsFilter.ts
- private latKalman = new KalmanFilter1D(0.000005, 0.0001)
+ private latKalman = new KalmanFilter1D(0.00003,  0.0001)
- MAX_ACCURACY     = 25
+ MAX_ACCURACY     = 30
- STATIONARY_SPEED basada en `coords.speed` del SO (0/null → siempre lento)
+ STATIONARY_SPEED basada en velocidad CALCULADA del desplazamiento
- DRIFT_RADIUS     = 25 m
+ DRIFT_RADIUS     = 12 m
- MIN_DISPLACEMENT = 8 m
+ MIN_DISPLACEMENT = 4 m
- MAX_HIKING_SPEED = 15 km/h
+ MAX_HIKING_SPEED = 18 km/h

GpsServiceImpl.ts
- distanceInterval: 10, timeInterval: 5000      (foreground)
+ distanceInterval: 5,  timeInterval: 3000
- distanceInterval: 10, timeInterval: 5000      (background)
+ distanceInterval: 5,  timeInterval: 3000
- deferredUpdatesInterval: 5000, deferredUpdatesDistance: 10
+ deferredUpdatesInterval: 3000, deferredUpdatesDistance: 5
- persistBackgroundLocation: acc > 25, d < 8    (headless)
+ persistBackgroundLocation: acc > 30, d < 4

TrackingMap.tsx
+ suspendFollowUntil ref (6 s tras un zoom manual)
- onRegionDidChange sobrescribe currentZoom (con valor intermedio)
+ onRegionDidChange solo actualiza heading; zoom solo cambia por botones
- followUser anima 500 ms en cada fix
+ followUser anima 350 ms y respeta suspendFollowUntil
```

`npx tsc --noEmit -p tsconfig.json` pasa sin errores tras estos cambios.
