import {
  documentDirectory, makeDirectoryAsync, getInfoAsync, deleteAsync,
  readAsStringAsync, writeAsStringAsync, createDownloadResumable,
} from 'expo-file-system/legacy';
import JSZip from 'jszip';
import {
  PROTOMAPS_VECTOR_LAYERS, PROTOMAPS_SOURCE_NAME,
} from '@shared/constants/protomapsBasemap';
import {
  OFFLINE_ASSETS_PACK_URL, OFFLINE_GLYPHS_TEMPLATE, OFFLINE_SPRITE_PATH,
  type OfflineRegionCatalogItem,
} from '@shared/constants/offlineRegions';

/**
 * Mapas OFFLINE basados en PMTiles (Fase 3).
 *
 * Un archivo `.pmtiles` en disco ES el dato offline: MapLibre Native (≥11.7)
 * lee `pmtiles://file://...` directamente, sin pre-descargar tiles (a diferencia
 * del viejo `OfflineManager.createPack`, que el plan free de Thunderforest
 * prohíbe). El style vector (capas Protomaps) apunta su source al `.pmtiles`
 * local y sus glyphs/sprite a un "assets pack" también local → mapa con
 * etiquetas, 100% sin conexión, gratis y legal (OSM/ODbL).
 */

const ROOT = (documentDirectory ?? '') + 'offline-maps/';
const REGIONS_DIR = ROOT + 'regions/';
const ASSETS_DIR = ROOT + 'assets/';
const ASSETS_ZIP = ROOT + 'assets-pack.zip';
const MANIFEST = ROOT + 'manifest.json';

export interface DownloadedRegion {
  id: string;
  name: string;
  /** [oeste, sur, este, norte] */
  bbox: [number, number, number, number];
  /** file:// del .pmtiles local */
  filePath: string;
  bytes: number;
  downloadedAt: string;
}

async function ensureDirs(): Promise<void> {
  for (const d of [ROOT, REGIONS_DIR, ASSETS_DIR]) {
    const info = await getInfoAsync(d);
    if (!info.exists) await makeDirectoryAsync(d, { intermediates: true });
  }
}

async function readManifest(): Promise<DownloadedRegion[]> {
  try {
    const info = await getInfoAsync(MANIFEST);
    if (!info.exists) return [];
    const raw = await readAsStringAsync(MANIFEST, { encoding: 'utf8' });
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeManifest(list: DownloadedRegion[]): Promise<void> {
  await ensureDirs();
  await writeAsStringAsync(MANIFEST, JSON.stringify(list), { encoding: 'utf8' });
}

/** Regiones descargadas (según el manifest). */
export async function listDownloadedRegions(): Promise<DownloadedRegion[]> {
  return readManifest();
}

/** ¿Está el assets pack (fonts + sprite) ya descargado y descomprimido? */
export async function isAssetsReady(): Promise<boolean> {
  // Marcador escrito SOLO al terminar de descomprimir todo el pack. Comprobar la
  // carpeta `fonts` no basta: un unzip interrumpido la deja a medias y nunca se
  // repararía (isAssetsReady devolvería true con archivos faltantes).
  const info = await getInfoAsync(ASSETS_DIR + '.ready');
  return info.exists;
}

/**
 * Descarga (una sola vez) el assets pack y lo descomprime en `assets/`.
 * No-op si ya está. Lanza si no hay URL configurada o falla la descarga.
 */
export async function ensureAssetsPack(
  onProgress?: (pct: number) => void,
): Promise<void> {
  if (await isAssetsReady()) return;
  if (!OFFLINE_ASSETS_PACK_URL) {
    throw new Error('Falta configurar OFFLINE_ASSETS_PACK_URL (fuentes/sprite del mapa offline).');
  }
  await ensureDirs();

  const dl = createDownloadResumable(
    OFFLINE_ASSETS_PACK_URL, ASSETS_ZIP, {},
    (p) => {
      if (onProgress && p.totalBytesExpectedToWrite > 0) {
        onProgress((p.totalBytesWritten / p.totalBytesExpectedToWrite) * 100);
      }
    },
  );
  const res = await dl.downloadAsync();
  if (!res?.uri) throw new Error('No se pudo descargar el pack de fuentes/sprite.');

  // Descomprimir: cada entrada → archivo en assets/ (preservando subcarpetas).
  const b64 = await readAsStringAsync(ASSETS_ZIP, { encoding: 'base64' });
  const zip = await JSZip.loadAsync(b64, { base64: true });
  const entries = Object.values(zip.files);
  for (const entry of entries) {
    if (entry.dir) continue;
    const rel = entry.name.replace(/\\/g, '/').replace(/^\/+/, '');
    const outPath = ASSETS_DIR + rel;
    const parent = outPath.slice(0, outPath.lastIndexOf('/') + 1);
    const pInfo = await getInfoAsync(parent);
    if (!pInfo.exists) await makeDirectoryAsync(parent, { intermediates: true });
    const data = await entry.async('base64');
    await writeAsStringAsync(outPath, data, { encoding: 'base64' });
  }
  await deleteAsync(ASSETS_ZIP, { idempotent: true });
  // Marca de completado: solo aquí, tras escribir TODAS las entradas.
  await writeAsStringAsync(ASSETS_DIR + '.ready', '1', { encoding: 'utf8' });
}

/**
 * Descarga el `.pmtiles` de una región del catálogo y lo registra en el
 * manifest. También asegura el assets pack (la primera vez). El progreso
 * reportado es solo el del `.pmtiles` (lo más pesado).
 */
export async function downloadRegion(
  item: OfflineRegionCatalogItem,
  onProgress?: (pct: number, bytes: number) => void,
): Promise<DownloadedRegion> {
  await ensureDirs();
  const filePath = `${REGIONS_DIR}${item.id}.pmtiles`;

  const dl = createDownloadResumable(
    item.url, filePath, {},
    (p) => {
      if (onProgress) {
        const pct = p.totalBytesExpectedToWrite > 0
          ? (p.totalBytesWritten / p.totalBytesExpectedToWrite) * 100 : 0;
        onProgress(pct, p.totalBytesWritten);
      }
    },
  );
  const res = await dl.downloadAsync();
  if (!res?.uri) throw new Error('No se pudo descargar la región.');

  const info = await getInfoAsync(filePath);
  const bytes = info.exists && 'size' in info ? (info.size as number) : item.sizeBytes;

  const entry: DownloadedRegion = {
    id: item.id, name: item.name, bbox: item.bbox,
    filePath: res.uri, bytes, downloadedAt: new Date().toISOString(),
  };
  const list = await readManifest();
  const next = [entry, ...list.filter((r) => r.id !== item.id)];
  await writeManifest(next);

  // El assets pack (fuentes/sprite) lo asegura el LLAMADOR por separado, para
  // poder mostrar su progreso y NO ocultar un fallo (si fallara aquí en
  // silencio, el toast diría "descargada" pero el mapa saldría sin etiquetas).
  return entry;
}

/** Borra el `.pmtiles` de una región y la quita del manifest. */
export async function deleteRegion(id: string): Promise<void> {
  const list = await readManifest();
  const target = list.find((r) => r.id === id);
  if (target) {
    try { await deleteAsync(target.filePath, { idempotent: true }); } catch { /* noop */ }
  }
  await writeManifest(list.filter((r) => r.id !== id));
}

/** Región cuyo bbox contiene la coordenada (o null). */
export function findRegionForCoord(
  lng: number, lat: number, regions: DownloadedRegion[],
): DownloadedRegion | null {
  for (const r of regions) {
    const [w, s, e, n] = r.bbox;
    if (lng >= w && lng <= e && lat >= s && lat <= n) return r;
  }
  return null;
}

/**
 * Elige la región offline "activa": la que cubre `coord` si se da, si no la más
 * reciente. Sirve para decidir qué base vector mostrar sin conexión.
 */
export function pickActiveRegion(
  regions: DownloadedRegion[], coord?: { lng: number; lat: number } | null,
): DownloadedRegion | null {
  if (regions.length === 0) return null;
  if (coord) {
    const hit = findRegionForCoord(coord.lng, coord.lat, regions);
    if (hit) return hit;
  }
  return regions[0]; // manifest guarda la más reciente primero
}

/**
 * Construye el style JSON vector (MapLibre style-spec v8) que usa el `.pmtiles`
 * local como source y el assets pack local para glyphs/sprite. Se pasa tal cual
 * a `MapView.mapStyle`.
 */
export function buildVectorStyle(region: DownloadedRegion): object {
  return {
    version: 8,
    glyphs: ASSETS_DIR + OFFLINE_GLYPHS_TEMPLATE,
    sprite: ASSETS_DIR + OFFLINE_SPRITE_PATH,
    sources: {
      [PROTOMAPS_SOURCE_NAME]: {
        type: 'vector',
        url: `pmtiles://${region.filePath}`,
      },
    },
    layers: PROTOMAPS_VECTOR_LAYERS,
  };
}
