import { KalmanFilter1D } from './KalmanFilter1D';

/**
 * Pipeline de filtrado GPS para apps de trekking.
 *
 * Capas:
 * 1. Gate de precisión — descarta puntos con accuracy > umbral
 * 2. Detección estacionaria — congela TODO si velocidad ≈ 0 y no hay desplazamiento real
 * 3. Kalman 1D — suaviza coordenadas (solo si en movimiento)
 * 4. Desplazamiento mínimo — no contar movimiento menor que el error GPS
 * 5. Anti-teleport — descartar saltos imposibles
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
  // Kalman filters
  private latKalman = new KalmanFilter1D(0.000005, 0.0001);
  private lonKalman = new KalmanFilter1D(0.000005, 0.0001);
  private altKalman = new KalmanFilter1D(0.5, 150);

  // Estado estacionario
  private stationaryCount = 0;
  private isStationary = false;
  private movingCount = 0;

  // Último punto aceptado
  private lastAccepted: { lat: number; lon: number; time: number } | null = null;
  // Ancla estacionaria (posición fija mientras está parado)
  private stationaryAnchor: { lat: number; lon: number } | null = null;

  // ── Umbrales (ajustados para trekking real) ────────────────
  /** Precisión máxima aceptada (metros). */
  private readonly MAX_ACCURACY = 25;
  /** Velocidad bajo la cual se considera "parado" (m/s). 0.5 m/s ≈ 1.8 km/h. */
  private readonly STATIONARY_SPEED = 0.5;
  /** Lecturas lentas consecutivas para declarar estacionario. */
  private readonly STATIONARY_READINGS = 3;
  /** Lecturas rápidas consecutivas para salir de estacionario. */
  private readonly MOVING_READINGS = 3;
  /** Radio de drift ignorado mientras está parado (metros). */
  private readonly DRIFT_RADIUS = 25;
  /** Desplazamiento mínimo para contar como movimiento real (metros). */
  private readonly MIN_DISPLACEMENT = 8;
  /** Velocidad máxima razonable caminando/trekking (km/h). */
  private readonly MAX_HIKING_SPEED_KMH = 15;

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

    // ── 2. Detección estacionaria (antes del Kalman para no contaminarlo) ──
    const reportedSpeed = speed ?? 0;
    const isSlowReading = reportedSpeed < this.STATIONARY_SPEED;

    if (isSlowReading) {
      this.stationaryCount++;
      this.movingCount = 0;
    } else {
      this.movingCount++;
      if (this.movingCount >= this.MOVING_READINGS) {
        this.stationaryCount = 0;
        this.isStationary = false;
        this.stationaryAnchor = null;
      }
    }

    if (this.stationaryCount >= this.STATIONARY_READINGS) {
      this.isStationary = true;
    }

    // Si estamos parados, verificar si el GPS reporta posición lejos del ancla
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

        // Desplazamiento grande → probablemente empezó a caminar
        this.isStationary = false;
        this.stationaryCount = 0;
        this.stationaryAnchor = null;
      }
    }

    // ── 3. Kalman — suavizar (solo cuando en movimiento) ──
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

    // ── 4. Desplazamiento mínimo ──
    if (this.lastAccepted) {
      const dist = fastDistance(
        this.lastAccepted.lat, this.lastAccepted.lon,
        filteredLat, filteredLon,
      );

      // Si speed es nulo/0 y movimiento < accuracy → es ruido
      if (reportedSpeed < 0.1 && accuracy !== null && dist < accuracy) {
        return null;
      }

      // Desplazamiento menor que umbral mínimo → ruido
      if (dist < this.MIN_DISPLACEMENT) {
        return null;
      }

      // ── 5. Anti-teleport ──
      const dtSec = (now - this.lastAccepted.time) / 1000;
      if (dtSec > 0 && dtSec < 60) { // solo para intervalos cortos (< 1 min)
        const segSpeedKmh = (dist / dtSec) * 3.6;
        if (segSpeedKmh > this.MAX_HIKING_SPEED_KMH) {
          return null;
        }
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
    this.stationaryCount = 0;
    this.movingCount = 0;
    this.isStationary = false;
    this.stationaryAnchor = null;
    this.lastAccepted = null;
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
