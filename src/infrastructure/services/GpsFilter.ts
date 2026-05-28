import { KalmanFilter1D } from './KalmanFilter1D';

/**
 * Pipeline de filtrado GPS para apps de trekking.
 *
 * Capas:
 * 1. Gate de precisión — descarta puntos con accuracy > umbral
 * 2. Anti-teleport — descarta saltos imposibles (sobre fix crudo)
 * 3. Detección estacionaria — congela TODO si NO hay desplazamiento real
 *    (basada en velocidad CALCULADA, no en el `speed` del SO)
 * 4. Kalman 1D SOLO en altitud (lat/lon usan coords raw; ver clase)
 * 5. Desplazamiento mínimo sobre raw — no contar jitter menor que el error GPS
 *
 * ⚠️ Lección de campo (2026-05-19): el `speed` reportado por expo-location
 * es 0/null en muchos Android caminando a paso normal. Usarlo como única
 * señal de "estacionario" hacía que el filtro creyera que el usuario estaba
 * parado mientras caminaba y descartara casi toda la ruta (6 puntos en 7 min
 * en pruebas reales). Ahora la velocidad se CALCULA del desplazamiento entre
 * fixes crudos; el `speed` del dispositivo solo corrobora si es > 0.
 */

export interface FilteredPoint {
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number | null;
  speed: number | null;
  timestamp: Date;
}

export class GpsFilter {
  // Solo aplicamos Kalman a la ALTITUD. La altitud GPS tiene ruido vertical
  // independiente del horizontal y un Kalman 1D mejora notablemente perfiles
  // de elevación (StatsCalculator espera valores suavizados con EMA/dead-band).
  //
  // Para lat/lon dejamos de usar Kalman (2026-05-26): el lag introducido (~2
  // fixes, ganancia ≈ 0.5) hacía que la polilínea quedara atrás del dot raw
  // y que codos en L se "cortaran" como diagonal cuando el filtro saltaba al
  // nuevo eje varios fixes después. La calidad la siguen aportando los gates
  // (accuracy, anti-teleport, stationary detection, min displacement).
  private altKalman = new KalmanFilter1D(0.8, 150);

  // Estado estacionario
  private slowCount = 0;
  private isStationary = false;

  // Último punto aceptado (coords ya suavizadas)
  private lastAccepted: { lat: number; lon: number; time: number } | null = null;
  // Último fix crudo (para velocidad calculada y anti-teleport)
  private lastRaw: { lat: number; lon: number; time: number } | null = null;
  // Ancla estacionaria (posición fija mientras está parado)
  private stationaryAnchor: { lat: number; lon: number } | null = null;
  // Ventana de últimos K fixes crudos para detectar "parado real" por
  // dispersión espacial (bbox), no solo por velocidad. Caminar muy lento
  // pero progresar linealmente debe seguir contando como movimiento.
  private rawWindow: { lat: number; lon: number }[] = [];

  // ── Umbrales (ajustados con datos reales de campo) ─────────────
  /** Precisión máxima aceptada (metros). 30 m: mejor línea ruidosa que sin línea. */
  private readonly MAX_ACCURACY = 30;
  /**
   * Velocidad CALCULADA bajo la cual se considera "parado" (m/s). ≈0.9 km/h.
   * Bajada de 0.4 → 0.25 (2026-05-26) porque caminantes lentos (paseo, subida
   * pronunciada) reportan 0.3-0.5 m/s sostenido y se metían a stationary,
   * congelando la polilínea hasta que rompieran el radio de drift.
   */
  private readonly STATIONARY_SPEED = 0.25;
  /**
   * Lecturas lentas consecutivas para declarar estacionario.
   * Subida 4 → 6 (2026-05-26): necesitas ~18-30 s sostenidos de < 0.25 m/s
   * antes de declarar "parado", margen extra contra falsos positivos.
   */
  private readonly STATIONARY_READINGS = 6;
  /** Radio de drift ignorado mientras está parado (metros). */
  private readonly DRIFT_RADIUS = 12;
  /**
   * Desplazamiento mínimo para contar como movimiento real (metros).
   * Bajada 4 → 3 (2026-05-26): con el Kalman más responsivo (q=1e-4) el
   * filtrado lagueaba menos y un gate de 4 m descartaba pasos cortos; 3 m
   * captura una polilínea más densa sin que jitter de pie pasen (el filtro
   * estacionario los corta antes).
   */
  private readonly MIN_DISPLACEMENT = 3;
  /** Velocidad máxima razonable caminando/trekking (km/h). */
  private readonly MAX_HIKING_SPEED_KMH = 18;
  /** Tamaño de la ventana de raw fixes para análisis espacial. */
  private readonly RAW_WINDOW_SIZE = 5;
  /**
   * Dispersión máxima (m) de la ventana bajo la cual se permite confirmar
   * estacionario. Caminar a 0.5 m/s genera una ventana con bbox > 10 m;
   * estar parado con ruido GPS típico mantiene bbox < ~10 m. Si supera este
   * umbral asumimos movimiento real y NO entramos a estacionario aunque la
   * velocidad instantánea sea baja.
   */
  private readonly STATIONARY_MAX_SPREAD = 10;

  process(
    latitude: number,
    longitude: number,
    altitude: number | null,
    accuracy: number | null,
    altitudeAccuracy: number | null,
    speed: number | null,
    timestamp: Date,
  ): FilteredPoint | null {

    // ── 1. Gate de precisión ──
    if (accuracy !== null && accuracy > this.MAX_ACCURACY) {
      return null;
    }

    const now = timestamp.getTime();

    // ── Velocidad calculada del desplazamiento entre fixes crudos ──
    // (fiable, a diferencia del `speed` del SO).
    let computedSpeed: number | null = null;
    if (this.lastRaw) {
      const dt = (now - this.lastRaw.time) / 1000;
      if (dt > 0) {
        const rawDist = fastDistance(
          this.lastRaw.lat, this.lastRaw.lon, latitude, longitude,
        );
        computedSpeed = rawDist / dt;

        // ── 2. Anti-teleport (solo intervalos cortos) ──
        // No actualizamos lastRaw: así el siguiente fix se mide contra la
        // posición previa al salto y el ruido espurio se ignora.
        if (dt < 60 && (rawDist / dt) * 3.6 > this.MAX_HIKING_SPEED_KMH) {
          return null;
        }
      }
    }
    this.lastRaw = { lat: latitude, lon: longitude, time: now };

    // Mantener ventana espacial (raw) para detectar dispersión real.
    this.rawWindow.push({ lat: latitude, lon: longitude });
    if (this.rawWindow.length > this.RAW_WINDOW_SIZE) this.rawWindow.shift();

    // ── 3. Detección estacionaria — combina velocidad CALCULADA + dispersión ──
    // Velocidad sola no basta: caminar a 0.5 m/s la dispara y descarta la
    // caminata real. La dispersión (max distancia entre puntos de la ventana)
    // separa "parado con ruido" (bbox pequeña) de "caminando lento" (bbox
    // crece linealmente con la trayectoria).
    const movingSpeed =
      computedSpeed ?? (speed != null && speed > 0 ? speed : null);
    const windowSpread = this.computeWindowSpread();

    if (movingSpeed !== null) {
      // Solo cuenta como "lento" si la dispersión también es baja.
      const lowSpread = windowSpread < this.STATIONARY_MAX_SPREAD;
      if (movingSpeed < this.STATIONARY_SPEED && lowSpread) {
        this.slowCount++;
      } else {
        this.slowCount = 0;
        this.isStationary = false;
        this.stationaryAnchor = null;
      }
    }

    if (this.slowCount >= this.STATIONARY_READINGS) {
      this.isStationary = true;
    }

    if (this.isStationary) {
      if (!this.stationaryAnchor && this.lastAccepted) {
        this.stationaryAnchor = { lat: this.lastAccepted.lat, lon: this.lastAccepted.lon };
      }

      if (this.stationaryAnchor) {
        const driftDist = fastDistance(
          this.stationaryAnchor.lat, this.stationaryAnchor.lon,
          latitude, longitude,
        );

        if (driftDist < this.DRIFT_RADIUS) {
          // Drift dentro del radio — NO actualizar Kalman, NO contar punto
          return null;
        }

        // Se alejó del ancla → volvió a caminar
        this.isStationary = false;
        this.slowCount = 0;
        this.stationaryAnchor = null;
      }
    }

    // ── 4. Altitud: Kalman (ruido vertical es independiente del horizontal
    //    y un Kalman 1D ayuda con perfiles de elevación). Lat/lon ya NO
    //    pasan por Kalman: filtrarlas introducía lag (~2 fixes) y cortaba
    //    esquinas en codos en L. El dot del mapa usa coords raw, así que
    //    para que la polilínea lo siga las coords guardadas también deben
    //    ser raw. Los gates (accuracy, anti-teleport, stationary, min
    //    displacement) siguen filtrando ruido grueso. ──
    let filteredAlt: number | null = null;
    if (altitude !== null) {
      const altAccOk = altitudeAccuracy === null || altitudeAccuracy <= 50;
      if (altAccOk) {
        filteredAlt = this.altKalman.filter(altitude, altitudeAccuracy ?? undefined);
      }
    }

    // ── 5. Desplazamiento mínimo (anti-jitter) sobre RAW ──
    // Antes comparaba contra coords filtradas (post-Kalman). Con el Kalman
    // lagueado, esa distancia era < real → fixes legítimos en caminata
    // rápida o en codos se descartaban → polilínea quedaba atrás del dot.
    if (this.lastAccepted) {
      const dist = fastDistance(
        this.lastAccepted.lat, this.lastAccepted.lon,
        latitude, longitude,
      );
      if (dist < this.MIN_DISPLACEMENT) {
        return null;
      }
    }

    this.lastAccepted = { lat: latitude, lon: longitude, time: now };

    return {
      latitude,
      longitude,
      altitude: filteredAlt,
      accuracy,
      speed,
      timestamp,
    };
  }

  reset(): void {
    this.altKalman.reset();
    this.slowCount = 0;
    this.isStationary = false;
    this.stationaryAnchor = null;
    this.lastAccepted = null;
    this.lastRaw = null;
    this.rawWindow = [];
  }

  /** Máxima distancia entre cualquier par de fixes en la ventana (m). */
  private computeWindowSpread(): number {
    const w = this.rawWindow;
    if (w.length < 2) return 0;
    let max = 0;
    for (let i = 0; i < w.length - 1; i++) {
      for (let j = i + 1; j < w.length; j++) {
        const d = fastDistance(w[i].lat, w[i].lon, w[j].lat, w[j].lon);
        if (d > max) max = d;
      }
    }
    return max;
  }

  /**
   * Pre-carga el filtro con el último punto conocido (típicamente al restaurar
   * un borrador). Sin esto, tras un reset() el primer fix nuevo pasaba sin
   * gate de desplazamiento mínimo ni anti-teleport (lastAccepted/lastRaw
   * eran null), y el Kalman convergía 3-5 fixes corridos antes de seguir bien.
   *
   * NO mete el punto a la salida: solo deja al filtro en un estado coherente.
   */
  seed(latitude: number, longitude: number, altitude: number | null, timestamp: Date): void {
    this.altKalman.reset();
    // Solo la altitud necesita seed del Kalman; lat/lon ya no se filtran.
    if (altitude !== null) this.altKalman.filter(altitude);

    const t = timestamp.getTime();
    this.lastAccepted = { lat: latitude, lon: longitude, time: t };
    this.lastRaw = { lat: latitude, lon: longitude, time: t };
    this.slowCount = 0;
    this.isStationary = false;
    this.stationaryAnchor = null;
    this.rawWindow = [{ lat: latitude, lon: longitude }];
  }
}

/** Distancia rápida en metros (aproximación equirectangular). */
function fastDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const avgLat = ((lat1 + lat2) / 2) * Math.PI / 180;
  const x = dLon * Math.cos(avgLat);
  return R * Math.sqrt(dLat * dLat + x * x);
}
