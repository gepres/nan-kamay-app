import { GpsPoint } from '@core/entities/GpsPoint';
import { fastDistanceMeters } from '@shared/utils/geometry';

/**
 * Parciales ("splits") por distancia a partir de los puntos GPS — función PURA.
 * Por cada km (configurable) acumula distancia, tiempo y desnivel positivo, y
 * calcula el ritmo (s/km). El último tramo parcial se marca con `partial`.
 */

export interface Split {
  /** 1, 2, 3… (número de km). */
  index: number;
  distanceMeters: number;
  durationSeconds: number;
  /** Ritmo en segundos por km (null si no hay distancia). */
  paceSecPerKm: number | null;
  elevGainMeters: number;
  /** true si es el tramo final incompleto (< splitMeters). */
  partial: boolean;
}

export function computeSplits(points: GpsPoint[], splitMeters = 1000): Split[] {
  if (points.length < 2) return [];

  const splits: Split[] = [];
  let prev = points[0];
  let distAcc = 0;
  let elevAcc = 0;
  let lastAlt = points[0].altitude;
  let startMs = points[0].recordedAt.getTime();
  let kmIndex = 1;

  const push = (endMs: number, partial: boolean) => {
    const durationSeconds = Math.max(0, (endMs - startMs) / 1000);
    splits.push({
      index: kmIndex,
      distanceMeters: distAcc,
      durationSeconds,
      paceSecPerKm: distAcc > 0 ? durationSeconds / (distAcc / 1000) : null,
      elevGainMeters: Math.round(elevAcc),
      partial,
    });
  };

  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    distAcc += fastDistanceMeters(prev.latitude, prev.longitude, p.latitude, p.longitude);
    if (p.altitude != null && lastAlt != null) {
      const dz = p.altitude - lastAlt;
      if (dz > 0) elevAcc += dz;
    }
    if (p.altitude != null) lastAlt = p.altitude;
    prev = p;

    if (distAcc >= splitMeters) {
      const endMs = p.recordedAt.getTime();
      push(endMs, false);
      kmIndex += 1;
      distAcc = 0;
      elevAcc = 0;
      startMs = endMs;
    }
  }

  // Tramo final incompleto (ignora restos minúsculos < 50 m).
  if (distAcc > 50) push(points[points.length - 1].recordedAt.getTime(), true);

  return splits;
}
