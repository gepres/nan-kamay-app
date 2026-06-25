/**
 * Utilidades de geometría para distancias en la superficie terrestre.
 *
 * Se usa la aproximación equirectangular: error < 0.5% en distancias
 * < 100 km y a latitudes < 60°, suficiente para alertas de desvío y
 * cálculos en pantalla. Para distancias largas o cerca de los polos
 * conviene `haversine`.
 */

const R_EARTH_M = 6371000;

/** Tolerancia por defecto (m) para simplificar la traza al dibujarla.
 *  ≈ error típico del GPS: colapsa el "serpenteo" lateral < 5 m sin tocar
 *  los vértices reales (curvas/codos quedan intactos). */
export const ROUTE_SIMPLIFY_EPSILON_M = 5;

/**
 * Índices de los puntos que conserva Ramer–Douglas–Peucker sobre `coords`
 * `[lon, lat][]` con tolerancia `epsilonMeters`. Devolver índices (en vez de
 * las coords) permite al llamador conservar el resto de campos del punto
 * original (altitud, tiempo, velocidad) al simplificar — necesario para
 * exportar un track GPX/KML sin perder esos datos en los vértices que viven.
 *
 * Iterativo (sin recursión) para soportar trazas largas. Proyección a plano
 * local métrico centrado en el primer punto (válido para rutas < ~100 km).
 */
export function simplifyIndices(
  coords: [number, number][],
  epsilonMeters: number = ROUTE_SIMPLIFY_EPSILON_M,
): number[] {
  const n = coords.length;
  if (n <= 2) return coords.map((_, i) => i);

  const lat0 = coords[0][1];
  const mLat = 111320;
  const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const X = coords.map(([lon, lat]) => [(lon - coords[0][0]) * mLon, (lat - lat0) * mLat] as const);

  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;

  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    const [ax, ay] = X[s];
    const [bx, by] = X[e];
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy);
    let idx = -1;
    let maxD = epsilonMeters;
    for (let i = s + 1; i < e; i++) {
      const [px, py] = X[i];
      // Distancia perpendicular a la RECTA s-e (no al segmento).
      const d = len < 1e-9
        ? Math.hypot(px - ax, py - ay)
        : Math.abs((px - ax) * (-dy) + (py - ay) * dx) / len;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (idx !== -1) {
      keep[idx] = 1;
      stack.push([s, idx]);
      stack.push([idx, e]);
    }
  }

  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(i);
  return out;
}

/**
 * Simplifica una polilínea `[lon, lat][]` con Ramer–Douglas–Peucker.
 * Elimina los desvíos laterales menores a `epsilonMeters` (jitter del GPS que
 * produce el serpenteo en línea recta) y CONSERVA los vértices reales y los
 * extremos (inicio/fin intactos → el cierre de un loop no cambia).
 */
export function simplifyLngLat(
  coords: [number, number][],
  epsilonMeters: number = ROUTE_SIMPLIFY_EPSILON_M,
): [number, number][] {
  return simplifyIndices(coords, epsilonMeters).map((i) => coords[i]);
}

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

/**
 * Segmento más cercano de una polilínea `[lon, lat][]` a un punto `[lon, lat]`,
 * con el punto proyectado (pie de la perpendicular, recortado a los extremos).
 * `index` = i significa el segmento entre `path[i]` y `path[i+1]`.
 * Devuelve null si la polilínea tiene menos de 2 vértices.
 *
 * Para "insertar un punto en un tramo": proyecta el toque al segmento más
 * cercano y se inserta en `index + 1`.
 */
export function nearestSegmentOnPath(
  lon: number, lat: number,
  path: [number, number][],
): { index: number; distanceMeters: number; point: [number, number] } | null {
  if (path.length < 2) return null;

  const lat0 = path[0][1];
  const lon0 = path[0][0];
  const mLat = 111320;
  const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const toXY = (lo: number, la: number) => ({ x: (lo - lon0) * mLon, y: (la - lat0) * mLat });
  const toLngLat = (x: number, y: number): [number, number] => [lon0 + x / mLon, lat0 + y / mLat];

  const p = toXY(lon, lat);
  let bestIdx = -1;
  let bestDist = Infinity;
  let bestPt: [number, number] = path[0];

  for (let i = 0; i < path.length - 1; i++) {
    const a = toXY(path[i][0], path[i][1]);
    const b = toXY(path[i + 1][0], path[i + 1][1]);
    const dx = b.x - a.x, dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const projX = a.x + t * dx, projY = a.y + t * dy;
    const d = Math.hypot(p.x - projX, p.y - projY);
    if (d < bestDist) { bestDist = d; bestIdx = i; bestPt = toLngLat(projX, projY); }
  }
  return { index: bestIdx, distanceMeters: bestDist, point: bestPt };
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
