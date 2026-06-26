/**
 * Descarga la red caminable (calles/senderos) de OpenStreetMap para una zona,
 * vía la API pública de Overpass, y la cachea en disco para reuso OFFLINE. Se
 * usa en el editor de trazado para "pegar" la ruta grabada a los caminos reales.
 *
 * Salvedades:
 *  - Requiere internet la PRIMERA vez por zona; después sale del caché local.
 *  - La cobertura de senderos de montaña en OSM es parcial. Por eso el snap es
 *    conservador (solo mueve puntos con un camino muy cerca; ver
 *    `snapCoordsToReference`): si OSM no tiene el sendero, el punto se conserva.
 *  - Overpass es un servicio comunitario: una consulta por zona, cacheada. No
 *    hacer descargas masivas.
 */
import {
  getInfoAsync, readAsStringAsync, writeAsStringAsync,
  makeDirectoryAsync, documentDirectory,
} from 'expo-file-system/legacy';

// Varios mirrors: el principal (overpass-api.de) suele saturarse (504/429).
const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const CACHE_DIR = `${documentDirectory}osm-cache/`;
// Vías caminables/rodables relevantes (excluye motorway/trunk: no se camina ahí).
const HIGHWAY_RE = 'path|footway|track|steps|pedestrian|cycleway|bridleway|residential|living_street|service|unclassified|road|tertiary|secondary|primary';

export type Bbox = { minLat: number; minLon: number; maxLat: number; maxLon: number };

function cacheKey(b: Bbox): string {
  const r = (v: number) => v.toFixed(3); // ~110 m de resolución → reusa caché entre rutas cercanas
  return `${r(b.minLat)}_${r(b.minLon)}_${r(b.maxLat)}_${r(b.maxLon)}`;
}

async function ensureDir(): Promise<void> {
  const info = await getInfoAsync(CACHE_DIR);
  if (!info.exists) await makeDirectoryAsync(CACHE_DIR, { intermediates: true });
}

/** Bbox de una traza `[lon,lat][]` con margen en metros. */
export function bboxFromCoords(coords: [number, number][], marginMeters = 60): Bbox {
  let minLat = Infinity, minLon = Infinity, maxLat = -Infinity, maxLon = -Infinity;
  for (const [lon, lat] of coords) {
    if (lat < minLat) minLat = lat;
    if (lon < minLon) minLon = lon;
    if (lat > maxLat) maxLat = lat;
    if (lon > maxLon) maxLon = lon;
  }
  const dLat = marginMeters / 111320;
  const dLon = marginMeters / (111320 * Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180) || 1);
  return { minLat: minLat - dLat, minLon: minLon - dLon, maxLat: maxLat + dLat, maxLon: maxLon + dLon };
}

/**
 * Polilíneas `[lon,lat][]` de los caminos de la zona. Usa el caché si existe;
 * si no, consulta Overpass y lo guarda (incluso si vacío, para no re-consultar
 * zonas sin datos). Lanza Error con mensaje legible si falla la descarga.
 */
export async function fetchPathsForBbox(bbox: Bbox): Promise<[number, number][][]> {
  const file = `${CACHE_DIR}${cacheKey(bbox)}.json`;

  // 1) Caché en disco.
  try {
    const info = await getInfoAsync(file);
    if (info.exists) {
      const parsed = JSON.parse(await readAsStringAsync(file));
      if (Array.isArray(parsed)) return parsed as [number, number][][];
    }
  } catch { /* caché corrupto → re-descarga */ }

  // 2) Overpass (probar mirrors en orden; el principal suele dar 504/429).
  const q = `[out:json][timeout:25];way["highway"~"^(${HIGHWAY_RE})$"](${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon});out geom;`;
  let json: any = null;
  let lastErr = '';
  for (const url of OVERPASS_MIRRORS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(q)}`,
        signal: controller.signal,
      });
      if (!res.ok) { lastErr = `HTTP ${res.status}`; continue; }
      json = await res.json();
      break;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    } finally {
      clearTimeout(timer);
    }
  }
  if (!json) {
    console.warn('[OSM] Overpass falló en todos los mirrors:', lastErr);
    throw new Error('No se pudo descargar el mapa de la zona (servidores OSM ocupados o sin conexión). Inténtalo de nuevo en un momento.');
  }

  const polylines: [number, number][][] = [];
  for (const el of json?.elements ?? []) {
    if (el.type === 'way' && Array.isArray(el.geometry)) {
      const line = el.geometry
        .filter((g: any) => typeof g.lat === 'number' && typeof g.lon === 'number')
        .map((g: any) => [g.lon, g.lat] as [number, number]);
      if (line.length >= 2) polylines.push(line);
    }
  }

  // 3) Cachear para uso offline.
  try {
    await ensureDir();
    await writeAsStringAsync(file, JSON.stringify(polylines));
  } catch { /* sin caché no es fatal */ }

  return polylines;
}
