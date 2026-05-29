/**
 * Servicio de elevación por DEM (Digital Elevation Model).
 *
 * Consulta la elevación real del TERRENO para coordenadas dadas usando la API
 * pública de OpenTopoData (dataset `aster30m`, cobertura global incl. Andes).
 * El terreno de un DEM es mucho más preciso y limpio que la altitud GPS para
 * el perfil de elevación y el desnivel acumulado, y coincide con los mapas
 * (msnm) en vez de la altura elipsoidal del GPS.
 *
 * Requiere conexión. Límite público: 100 ubicaciones/petición, ~1 req/s.
 */

export interface LatLon {
  latitude: number;
  longitude: number;
}

const ENDPOINT = 'https://api.opentopodata.org/v1/aster30m';
const BATCH = 100;
const REQ_DELAY_MS = 1100; // respeta el rate-limit (~1 req/s)

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Devuelve la elevación de terreno (m) para cada punto, en el mismo orden.
 * Un punto sin dato (mar, fuera de cobertura) devuelve null.
 */
export async function fetchTerrainElevations(points: LatLon[]): Promise<(number | null)[]> {
  const out: (number | null)[] = [];

  for (let i = 0; i < points.length; i += BATCH) {
    const batch = points.slice(i, i + BATCH);
    const locs = batch.map((p) => `${p.latitude},${p.longitude}`).join('|');
    const url = `${ENDPOINT}?locations=${encodeURIComponent(locs)}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Servicio de elevación: HTTP ${res.status}`);
    const json = await res.json();
    if (json.status && json.status !== 'OK') {
      throw new Error(`Servicio de elevación: ${json.error ?? json.status}`);
    }
    for (const r of json.results ?? []) {
      out.push(typeof r.elevation === 'number' ? r.elevation : null);
    }

    // Pausa entre lotes para no exceder el rate-limit (solo si quedan más).
    if (i + BATCH < points.length) await delay(REQ_DELAY_MS);
  }

  return out;
}
