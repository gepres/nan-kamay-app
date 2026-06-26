/**
 * Utilidades de análisis y edición de trazas GPS (post-grabación).
 *
 * Funciones PURAS sobre arrays de coordenadas `[lon, lat]` (mismo formato que
 * `geometry.ts`). La pantalla del editor mapea los resultados de vuelta a
 * `GpsPoint` conservando altitud/tiempo/precisión/velocidad de cada punto.
 */
import { fastDistanceMeters, nearestSegmentOnPath } from './geometry';

export type NoisyZone = { lo: number; hi: number; sinuosity: number; lengthM: number };

/**
 * Detecta zonas con "serpenteo" GPS: ventanas donde el camino recorrido es
 * mucho más largo que la distancia en línea recta entre sus extremos
 * (sinuosidad alta) PERO abarcan poco terreno (jitter local, no un zigzag
 * legítimo largo como una sucesión de switchbacks de montaña). No modifica
 * nada: solo señala dónde mirar. El usuario decide si suaviza/endereza/nada.
 */
export function detectNoisyZones(
  coords: [number, number][],
  opts: { window?: number; sinuosityThreshold?: number; maxChordMeters?: number; maxZones?: number } = {},
): NoisyZone[] {
  const W = opts.window ?? 10;
  const SIN = opts.sinuosityThreshold ?? 1.45;
  const MAX_CHORD = opts.maxChordMeters ?? 80;
  const MAX_ZONES = opts.maxZones ?? 6;
  const n = coords.length;
  if (n < W + 1) return [];

  // Longitud acumulada → pathLen de cualquier ventana en O(1).
  const cum = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    cum[i] = cum[i - 1] + fastDistanceMeters(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0]);
  }

  const raw: NoisyZone[] = [];
  for (let i = 0; i + W < n; i++) {
    const lo = i, hi = i + W;
    const pathLen = cum[hi] - cum[lo];
    const chord = fastDistanceMeters(coords[lo][1], coords[lo][0], coords[hi][1], coords[hi][0]);
    if (chord < 2 || chord > MAX_CHORD) continue; // chord~0: parada quieta; chord grande: tramo legítimo
    const sin = pathLen / chord;
    if (sin > SIN) raw.push({ lo, hi, sinuosity: sin, lengthM: pathLen });
  }
  if (!raw.length) return [];

  // Fusionar ventanas solapadas/contiguas en zonas.
  const merged: NoisyZone[] = [];
  for (const z of raw) {
    const last = merged[merged.length - 1];
    if (last && z.lo <= last.hi + 2) {
      last.hi = Math.max(last.hi, z.hi);
      last.sinuosity = Math.max(last.sinuosity, z.sinuosity);
      last.lengthM = cum[last.hi] - cum[last.lo];
    } else {
      merged.push({ ...z });
    }
  }
  return merged.sort((a, b) => b.sinuosity - a.sinuosity).slice(0, MAX_ZONES);
}

export type SnapResult = { coords: [number, number][]; moved: boolean[]; movedCount: number };

type Bbox = { minLon: number; minLat: number; maxLon: number; maxLat: number };
function bboxOf(path: [number, number][]): Bbox {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const [lon, lat] of path) {
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  }
  return { minLon, minLat, maxLon, maxLat };
}

/**
 * Pega cada punto al segmento más cercano de una red de polilíneas de
 * referencia (una ruta planificada/previa, o la red de calles/senderos de OSM),
 * SOLO si está a <= `maxDistMeters`. Si no hay nada cerca, CONSERVA el punto
 * original — clave en trekking: muchos senderos no están en OSM y no queremos
 * arrastrar el punto a una calle equivocada.
 *
 * Rechazo rápido por bbox de cada polilínea para soportar cientos de vías.
 */
export function snapCoordsToReference(
  coords: [number, number][],
  refs: [number, number][][],
  maxDistMeters = 20,
): SnapResult {
  const usable = refs.filter((r) => r.length >= 2);
  const boxes = usable.map(bboxOf);
  const out: [number, number][] = new Array(coords.length);
  const moved: boolean[] = new Array(coords.length);
  let movedCount = 0;

  for (let k = 0; k < coords.length; k++) {
    const [lon, lat] = coords[k];
    const dLat = maxDistMeters / 111320;
    const dLon = maxDistMeters / (111320 * Math.cos((lat * Math.PI) / 180) || 1);
    let best: [number, number] | null = null;
    let bestD = maxDistMeters;
    for (let r = 0; r < usable.length; r++) {
      const b = boxes[r];
      if (lon < b.minLon - dLon || lon > b.maxLon + dLon || lat < b.minLat - dLat || lat > b.maxLat + dLat) continue;
      const res = nearestSegmentOnPath(lon, lat, usable[r]);
      if (res && res.distanceMeters < bestD) { bestD = res.distanceMeters; best = res.point; }
    }
    if (best) { out[k] = best; moved[k] = true; movedCount++; }
    else { out[k] = coords[k]; moved[k] = false; }
  }
  return { coords: out, moved, movedCount };
}

export type CloseLoopPlan = { trimAfter: number; snapTo: [number, number]; gapMeters: number };

/**
 * Plan para cerrar una ruta circular: busca en la cola (último ~30%) el punto
 * que más se acerca al inicio, recorta el "sobrepaso" posterior y devuelve a
 * qué coordenada (el inicio) pegarlo. Devuelve null si el final no vuelve cerca
 * del inicio (no era un lazo).
 */
export function closeLoop(coords: [number, number][], thresholdMeters = 70): CloseLoopPlan | null {
  const n = coords.length;
  if (n < 4) return null;
  const start = coords[0];
  const from = Math.max(1, Math.floor(n * 0.7));
  let bestIdx = n - 1;
  let bestD = Infinity;
  for (let i = from; i < n; i++) {
    const d = fastDistanceMeters(coords[i][1], coords[i][0], start[1], start[0]);
    if (d < bestD) { bestD = d; bestIdx = i; }
  }
  if (bestD > thresholdMeters) return null;
  return { trimAfter: bestIdx, snapTo: start, gapMeters: bestD };
}
