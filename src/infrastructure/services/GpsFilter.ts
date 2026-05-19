import { KalmanFilter1D } from './KalmanFilter1D';

/**
 * Pipeline de filtrado GPS para apps de trekking.
 *
 * Capas:
 * 1. Gate de precisión — descarta puntos con accuracy > umbral
 * 2. Anti-teleport — descarta saltos imposibles (sobre fix crudo)
 * 3. Detección estacionaria — congela TODO si NO hay desplazamiento real
 *    (basada en velocidad CALCULADA, no en el `speed` del SO)
 * 4. Kalman 1D — suaviza coordenadas
 * 5. Desplazamiento mínimo — no contar jitter menor que el error GPS
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
  // Kalman filters — q más alto = sigue mejor el movimiento real (menos lag
  // en curvas). El valor anterior (0.000005) suavizaba tanto que recortaba
  // esquinas y reducía el desplazamiento entre puntos hasta hacerlos caer en
  // el gate de desplazamiento mínimo.
  private latKalman = new KalmanFilter1D(0.00003, 0.0001);
  private lonKalman = new KalmanFilter1D(0.00003, 0.0001);
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

  // ── Umbrales (ajustados con datos reales de campo) ─────────────
  /** Precisión máxima aceptada (metros). 30 m: mejor línea ruidosa que sin línea. */
  private readonly MAX_ACCURACY = 30;
  /** Velocidad CALCULADA bajo la cual se considera "parado" (m/s). ≈1.4 km/h. */
  private readonly STATIONARY_SPEED = 0.4;
  /** Lecturas lentas consecutivas para declarar estacionario. */
  private readonly STATIONARY_READINGS = 4;
  /** Radio de drift ignorado mientras está parado (metros). */
  private readonly DRIFT_RADIUS = 12;
  /** Desplazamiento mínimo para contar como movimiento real (metros). */
  private readonly MIN_DISPLACEMENT = 4;
  /** Velocidad máxima razonable caminando/trekking (km/h). */
  private readonly MAX_HIKING_SPEED_KMH = 18;

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

    // ── 3. Detección estacionaria (por velocidad calculada, no por `speed`) ──
    // Si no hay velocidad fiable aún, el `speed` del SO solo cuenta si es > 0.
    const movingSpeed =
      computedSpeed ?? (speed != null && speed > 0 ? speed : null);

    if (movingSpeed !== null) {
      if (movingSpeed < this.STATIONARY_SPEED) {
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

    // ── 4. Kalman — suavizar ──
    const accVal = accuracy ?? undefined;
    const filteredLat = this.latKalman.filter(latitude, accVal);
    const filteredLon = this.lonKalman.filter(longitude, accVal);

    let filteredAlt: number | null = null;
    if (altitude !== null) {
      const altAccOk = altitudeAccuracy === null || altitudeAccuracy <= 50;
      if (altAccOk) {
        filteredAlt = this.altKalman.filter(altitude, altitudeAccuracy ?? undefined);
      }
    }

    // ── 5. Desplazamiento mínimo (anti-jitter) ──
    if (this.lastAccepted) {
      const dist = fastDistance(
        this.lastAccepted.lat, this.lastAccepted.lon,
        filteredLat, filteredLon,
      );
      if (dist < this.MIN_DISPLACEMENT) {
        return null;
      }
    }

    this.lastAccepted = { lat: filteredLat, lon: filteredLon, time: now };

    return {
      latitude: filteredLat,
      longitude: filteredLon,
      altitude: filteredAlt,
      accuracy,
      speed,
      timestamp,
    };
  }

  reset(): void {
    this.latKalman.reset();
    this.lonKalman.reset();
    this.altKalman.reset();
    this.slowCount = 0;
    this.isStationary = false;
    this.stationaryAnchor = null;
    this.lastAccepted = null;
    this.lastRaw = null;
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
