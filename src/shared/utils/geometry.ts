/**
 * Utilidades de geometría para distancias en la superficie terrestre.
 *
 * Se usa la aproximación equirectangular: error < 0.5% en distancias
 * < 100 km y a latitudes < 60°, suficiente para alertas de desvío y
 * cálculos en pantalla. Para distancias largas o cerca de los polos
 * conviene `haversine`.
 */

const R_EARTH_M = 6371000;

/** Distancia rápida en metros entre dos coords (equirectangular). */
export function fastDistanceMeters(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const avgLat = ((lat1 + lat2) / 2) * Math.PI / 180;
  const x = dLon * Math.cos(avgLat);
  return R_EARTH_M * Math.sqrt(dLat * dLat + x * x);
}

/**
 * Distancia mínima en metros desde un punto a una polilínea (cadena de
 * segmentos). Devuelve Infinity si la polilínea no tiene segmentos.
 *
 * Para cada segmento calcula la distancia al punto en su proyección
 * perpendicular (clamping a los extremos). Coordenadas convertidas a
 * un plano local métrico centrado en el primer vértice (válido para
 * polilíneas en una ventana < 100 km).
 */
export function distanceToPolylineMeters(
  lat: number, lon: number,
  polyline: { latitude: number; longitude: number }[],
): number {
  if (polyline.length < 2) return Infinity;

  // Plano local: usamos la lat media como referencia para escalar lon→x.
  const lat0 = polyline[0].latitude;
  const cosLat0 = Math.cos((lat0 * Math.PI) / 180);
  const metersPerDegLat = 111320;
  const metersPerDegLon = metersPerDegLat * cosLat0;

  const toXY = (la: number, lo: number) => ({
    x: (lo - polyline[0].longitude) * metersPerDegLon,
    y: (la - lat0) * metersPerDegLat,
  });

  const p = toXY(lat, lon);
  let min = Infinity;

  for (let i = 0; i < polyline.length - 1; i++) {
    const a = toXY(polyline[i].latitude, polyline[i].longitude);
    const b = toXY(polyline[i + 1].latitude, polyline[i + 1].longitude);
    const d = distanceToSegment(p, a, b);
    if (d < min) min = d;
  }
  return min;
}

function distanceToSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ex = p.x - a.x;
    const ey = p.y - a.y;
    return Math.sqrt(ex * ex + ey * ey);
  }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  const ex = p.x - projX;
  const ey = p.y - projY;
  return Math.sqrt(ex * ex + ey * ey);
}
