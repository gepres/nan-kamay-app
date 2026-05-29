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

const MIN_SEGMENT = 2;       // metros — micro-jitter
const MAX_SPEED_KMH = 15;    // km/h — teleport para trekking
const EMA_ALPHA = 0.15;
const DEAD_BAND = 3;         // metros (bajado de 4: la mediana ya mata spikes)
const MEDIAN_WINDOW = 5;     // ventana de mediana móvil (anti-spike) sobre altitud

/** Mediana de un array corto (≤ MEDIAN_WINDOW). No muta el original. */
function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

/**
 * Acumulador incremental. Procesa los puntos en orden produciendo el MISMO
 * resultado que `StatsCalculator.calculate` (mismo recorrido izquierda→derecha
 * con los mismos filtros), pero en O(1) por punto en vez de O(n) — evita el
 * O(n²) acumulado al recalcular todo el array en cada `addGpsPoint`.
 */
export interface StatsAccumulator {
  count: number;
  lastPoint: GpsPoint | null;
  distanceMeters: number;
  maxSpeedKmh: number;
  altCount: number;
  firstAlt: number;
  emaInit: boolean;
  ema: number;
  lastSignificant: number;
  gain: number;
  loss: number;
  maxAlt: number;
  minAlt: number;
  /** Ventana móvil de altitudes crudas para la mediana anti-spike. */
  altBuffer: number[];
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
  static createAccumulator(): StatsAccumulator {
    return {
      count: 0,
      lastPoint: null,
      distanceMeters: 0,
      maxSpeedKmh: 0,
      altCount: 0,
      firstAlt: 0,
      emaInit: false,
      ema: 0,
      lastSignificant: 0,
      gain: 0,
      loss: 0,
      maxAlt: 0,
      minAlt: 0,
      altBuffer: [],
    };
  }

  /** Incorpora un punto al acumulador (muta `acc`). O(1). */
  static accumulate(acc: StatsAccumulator, curr: GpsPoint): void {
    const prev = acc.lastPoint;
    acc.count++;

    if (prev) {
      const segDist = haversineDistance(
        { latitude: prev.latitude, longitude: prev.longitude },
        { latitude: curr.latitude, longitude: curr.longitude },
      );
      if (segDist >= MIN_SEGMENT) {
        const dtSec = (curr.recordedAt.getTime() - prev.recordedAt.getTime()) / 1000;
        let teleport = false;
        if (dtSec > 0) {
          const segSpeedKmh = (segDist / dtSec) * 3.6;
          if (segSpeedKmh > MAX_SPEED_KMH) teleport = true;
        }
        if (!teleport) {
          acc.distanceMeters += segDist;
          if (curr.speed !== null) {
            const speedKmh = curr.speed * 3.6;
            if (speedKmh <= MAX_SPEED_KMH) {
              acc.maxSpeedKmh = Math.max(acc.maxSpeedKmh, speedKmh);
            }
          }
        }
      }
    }
    acc.lastPoint = curr;

    if (curr.altitude !== null) {
      acc.altCount++;
      // Mediana móvil (trailing) anti-spike sobre la altitud cruda antes del EMA.
      acc.altBuffer.push(curr.altitude);
      if (acc.altBuffer.length > MEDIAN_WINDOW) acc.altBuffer.shift();
      const med = median(acc.altBuffer);
      if (!acc.emaInit) {
        acc.emaInit = true;
        acc.firstAlt = med;
        acc.ema = med;
        acc.lastSignificant = med;
        acc.maxAlt = med;
        acc.minAlt = med;
      } else {
        acc.ema = EMA_ALPHA * med + (1 - EMA_ALPHA) * acc.ema;
        acc.maxAlt = Math.max(acc.maxAlt, acc.ema);
        acc.minAlt = Math.min(acc.minAlt, acc.ema);
        const diff = acc.ema - acc.lastSignificant;
        if (diff > DEAD_BAND) {
          acc.gain += diff;
          acc.lastSignificant = acc.ema;
        } else if (diff < -DEAD_BAND) {
          acc.loss += Math.abs(diff);
          acc.lastSignificant = acc.ema;
        }
      }
    }
  }

  /** Reconstruye un acumulador a partir de una lista de puntos (O(n) una vez). */
  static buildAccumulator(points: GpsPoint[]): StatsAccumulator {
    const acc = StatsCalculator.createAccumulator();
    for (const p of points) StatsCalculator.accumulate(acc, p);
    return acc;
  }

  /** Produce RouteStats a partir del acumulador. */
  static finalize(acc: StatsAccumulator, durationSeconds: number): RouteStats {
    if (acc.count < 2) {
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
    const hasElev = acc.altCount >= 2;
    const single = acc.altCount === 1 ? acc.firstAlt : 0;
    return {
      distanceMeters: acc.distanceMeters,
      durationSeconds,
      elevationGainMeters: hasElev ? acc.gain : 0,
      elevationLossMeters: hasElev ? acc.loss : 0,
      maxElevationMeters: hasElev ? acc.maxAlt : single,
      minElevationMeters: hasElev ? acc.minAlt : single,
      avgSpeedKmh:
        durationSeconds > 0 ? (acc.distanceMeters / 1000) / (durationSeconds / 3600) : 0,
      maxSpeedKmh: acc.maxSpeedKmh,
    };
  }

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
    // Extraer altitudes no nulas
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

    // Paso 0: mediana móvil (trailing) anti-spike sobre la altitud cruda.
    const buf: number[] = [];
    const denoised: number[] = [];
    for (const a of altitudes) {
      buf.push(a);
      if (buf.length > MEDIAN_WINDOW) buf.shift();
      denoised.push(median(buf));
    }

    // Paso 1: EMA smoothing sobre la serie ya sin spikes
    const smoothed: number[] = [denoised[0]];
    for (let i = 1; i < denoised.length; i++) {
      smoothed.push(EMA_ALPHA * denoised[i] + (1 - EMA_ALPHA) * smoothed[i - 1]);
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
