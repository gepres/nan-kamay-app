export interface Coordinates {
  latitude: number;
  longitude: number;
  altitude?: number | null;
}

/** Calcula la distancia en metros entre dos coordenadas usando la fórmula de Haversine */
export function haversineDistance(a: Coordinates, b: Coordinates): number {
  const R = 6371000; // radio de la Tierra en metros
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);

  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);

  const formula =
    sinLat * sinLat +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * sinLon * sinLon;

  return R * 2 * Math.atan2(Math.sqrt(formula), Math.sqrt(1 - formula));
}
