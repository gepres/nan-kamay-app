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
    let elevationGain = 0;
    let elevationLoss = 0;
    let maxElevation = -Infinity;
    let minElevation = Infinity;
    let maxSpeedKmh = 0;

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];

      // Distancia horizontal
      distanceMeters += haversineDistance(
        { latitude: prev.latitude, longitude: prev.longitude },
        { latitude: curr.latitude, longitude: curr.longitude },
      );

      // Elevación
      if (prev.altitude !== null && curr.altitude !== null) {
        const diff = curr.altitude - prev.altitude;
        if (diff > 0) elevationGain += diff;
        else elevationLoss += Math.abs(diff);
      }

      if (curr.altitude !== null) {
        maxElevation = Math.max(maxElevation, curr.altitude);
        minElevation = Math.min(minElevation, curr.altitude);
      }

      // Velocidad máxima
      if (curr.speed !== null) {
        const speedKmh = curr.speed * 3.6;
        maxSpeedKmh = Math.max(maxSpeedKmh, speedKmh);
      }
    }

    const avgSpeedKmh =
      durationSeconds > 0 ? (distanceMeters / 1000) / (durationSeconds / 3600) : 0;

    return {
      distanceMeters,
      durationSeconds,
      elevationGainMeters: elevationGain,
      elevationLossMeters: elevationLoss,
      maxElevationMeters: maxElevation === -Infinity ? 0 : maxElevation,
      minElevationMeters: minElevation === Infinity ? 0 : minElevation,
      avgSpeedKmh,
      maxSpeedKmh,
    };
  }
}
