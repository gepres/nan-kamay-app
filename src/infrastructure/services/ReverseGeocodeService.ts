/**
 * Reverse-geocoding (coordenadas → nombre de lugar) vía Nominatim/OSM. Se usa
 * para etiquetar las "zonas" de la vista Lugares con un nombre real (ciudad /
 * pueblo / distrito) en vez del nombre de la ruta más larga del clúster.
 *
 * Salvedades:
 *  - ONLINE-ONLY: sin red devuelve null y el caller usa su etiqueta actual.
 *  - Cacheado en memoria (sesión) + disco (~1 km) para no reconsultar.
 *  - Nominatim es comunitario (límite ~1 req/s): el caller debe consultar las
 *    zonas en serie, no en ráfaga. Una zona se geocodifica una vez y queda en caché.
 */
import {
  getInfoAsync, readAsStringAsync, writeAsStringAsync,
  makeDirectoryAsync, documentDirectory,
} from 'expo-file-system/legacy';

const NOMINATIM_REVERSE = 'https://nominatim.openstreetmap.org/reverse';
const CACHE_DIR = `${documentDirectory}geocode-cache/`;

// Caché en memoria por sesión (clave = coord redondeada ~1.1 km).
const memCache = new Map<string, string | null>();

function key(lat: number, lon: number): string {
  const r = (v: number) => v.toFixed(2);
  return `${r(lat)}_${r(lon)}`;
}

async function ensureDir(): Promise<void> {
  const info = await getInfoAsync(CACHE_DIR);
  if (!info.exists) await makeDirectoryAsync(CACHE_DIR, { intermediates: true });
}

/** Nombre de lugar más representativo a nivel "zona" (ciudad/pueblo/distrito). */
function pickName(address: Record<string, string> | undefined, displayName?: string): string | null {
  if (address) {
    const candidate =
      address.city || address.town || address.village || address.hamlet ||
      address.suburb || address.municipality || address.county ||
      address.state_district || address.state;
    if (candidate) return candidate;
  }
  const first = displayName?.split(',')[0]?.trim();
  return first || null;
}

/**
 * Devuelve el nombre de lugar de unas coordenadas, o null si no hay red / sin
 * match. No lanza: pensado para enriquecer etiquetas sin romper la pantalla.
 */
export async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  const k = key(lat, lon);
  if (memCache.has(k)) return memCache.get(k) ?? null;

  // 1) Caché en disco.
  const file = `${CACHE_DIR}${k}.json`;
  try {
    const info = await getInfoAsync(file);
    if (info.exists) {
      const cached = JSON.parse(await readAsStringAsync(file));
      const name = typeof cached?.name === 'string' ? cached.name : null;
      memCache.set(k, name);
      return name;
    }
  } catch { /* caché corrupto → re-consulta */ }

  // 2) Nominatim reverse (online).
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const url = `${NOMINATIM_REVERSE}?format=jsonv2&zoom=10&accept-language=es&lat=${lat}&lon=${lon}`;
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'NanKamay/1.0 (trekking app)', 'Accept-Language': 'es' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const name = pickName(data?.address, data?.display_name);
    memCache.set(k, name);
    // Persistir solo si hubo nombre (un null podría ser fallo transitorio).
    if (name) {
      try { await ensureDir(); await writeAsStringAsync(file, JSON.stringify({ name })); } catch { /* noop */ }
    }
    return name;
  } catch {
    return null; // sin red / timeout → no cachear el fallo
  } finally {
    clearTimeout(timer);
  }
}
