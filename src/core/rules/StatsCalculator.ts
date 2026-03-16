import { GpsPoint } from '../entities/GpsPoint';
import { haversineDistance } from '../value-objects/Coordinates';

export interface RouteStats {
  distanceMeters: number;
  durationSeconds: number;
  elevationGainMeters: number;
  elevationLossMeters: number;
  maxElevationMeters: number;
  minElevationMeters: number;
  avgSpeedKmh: number;
  maxSpeedKmh: number;
}

/**
 * Calcula estadísticas de ruta con filtrado de ruido GPS.
 *
 * Técnicas aplicadas:
 * - Segmentos < 2m descartados (micro-jitter)
 * - Segmentos > 15 km/h descartados (teleport GPS)
 * - Elevación: EMA smoothing (alpha=0.15) + dead-band (4m)
 */
export class StatsCalculator {
  static calculate(points: GpsPoint[], durationSeconds: number): RouteStats {
    if (points.length < 2) {
      return {
        distanceMeters: 0,
        durationSeconds,
        elevationGainMeters: 0,
        elevationLossMeters: 0,
        maxElevationMeters: 0,
        minElevationMeters: 0,
        avgSpeedKmh: 0,
        maxSpeedKmh: 0,
      };
    }

    let distanceMeters = 0;
    let maxSpeedKmh = 0;

    // ── Distancia + velocidad máxima (con filtros) ──
    const MIN_SEGMENT = 2;         // metros — micro-jitter
    const MAX_SPEED_KMH = 15;     // km/h — teleport para trekking

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];

      const segDist = haversineDistance(
        { latitude: prev.latitude, longitude: prev.longitude },
        { latitude: curr.latitude, longitude: curr.longitude },
      );

      // Descartar micro-segmentos (ruido)
      if (segDist < MIN_SEGMENT) continue;

      // Descartar teleports
      const dtSec = (curr.recordedAt.getTime() - prev.recordedAt.getTime()) / 1000;
      if (dtSec > 0) {
        const segSpeedKmh = (segDist / dtSec) * 3.6;
        if (segSpeedKmh > MAX_SPEED_KMH) continue;
      }

      distanceMeters += segDist;

      // Velocidad máxima (del sensor GPS, no calculada)
      if (curr.speed !== null) {
        const speedKmh = curr.speed * 3.6;
        if (speedKmh <= MAX_SPEED_KMH) {
          maxSpeedKmh = Math.max(maxSpeedKmh, speedKmh);
        }
      }
    }

    // ── Elevación: EMA smoothing + dead-band ──
    const { gain, loss, max, min } = StatsCalculator.calculateElevation(points);

    const avgSpeedKmh =
      durationSeconds > 0 ? (distanceMeters / 1000) / (durationSeconds / 3600) : 0;

    return {
      distanceMeters,
      durationSeconds,
      elevationGainMeters: gain,
      elevationLossMeters: loss,
      maxElevationMeters: max,
      minElevationMeters: min,
      avgSpeedKmh,
      maxSpeedKmh,
    };
  }

  /**
   * EMA (Exponential Moving Average) + dead-band para elevación.
   *
   * 1. Suaviza altitudes ruidosas con EMA (alpha=0.15)
   * 2. Solo cuenta cambios > 4m (dead-band) para evitar acumular ruido GPS
   */
  private static calculateElevation(points: GpsPoint[]): {
    gain: number;
    loss: number;
    max: number;
    min: number;
  } {
    const EMA_ALPHA = 0.15;
    const DEAD_BAND = 4; // metros

    // Extraer altitudes no nulas con su índice
    const altitudes: number[] = [];
    for (const p of points) {
      if (p.altitude !== null) {
        altitudes.push(p.altitude);
      }
    }

    if (altitudes.length < 2) {
      const single = altitudes.length === 1 ? altitudes[0] : 0;
      return { gain: 0, loss: 0, max: single, min: single };
    }

    // Paso 1: EMA smoothing
    const smoothed: number[] = [altitudes[0]];
    for (let i = 1; i < altitudes.length; i++) {
      smoothed.push(EMA_ALPHA * altitudes[i] + (1 - EMA_ALPHA) * smoothed[i - 1]);
    }

    // Paso 2: Dead-band — solo contar cambios significativos
    let gain = 0;
    let loss = 0;
    let maxAlt = smoothed[0];
    let minAlt = smoothed[0];
    let lastSignificant = smoothed[0];

    for (let i = 1; i < smoothed.length; i++) {
      const alt = smoothed[i];
      maxAlt = Math.max(maxAlt, alt);
      minAlt = Math.min(minAlt, alt);

      const diff = alt - lastSignificant;
      if (diff > DEAD_BAND) {
        gain += diff;
        lastSignificant = alt;
      } else if (diff < -DEAD_BAND) {
        loss += Math.abs(diff);
        lastSignificant = alt;
      }
    }

    return { gain, loss, max: maxAlt, min: minAlt };
  }
}
