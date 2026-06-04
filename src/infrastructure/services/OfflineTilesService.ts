import { OfflineManager } from '@maplibre/maplibre-react-native';
import { cacheDirectory, writeAsStringAsync } from 'expo-file-system/legacy';
import { thunderforestTileUrls } from '@infrastructure/config/env';

/**
 * Descarga de tiles para uso OFFLINE (Fase 3 — mapas offline).
 *
 * Envuelve el OfflineManager de MapLibre. Como la app usa `RasterSource`
 * Thunderforest directo (no un style JSON), construimos un style mínimo local
 * que referencia esas mismas URLs de tiles y se lo pasamos a `createPack`. Las
 * tiles quedan en la BD offline de MapLibre; cuando el MapView pide esas mismas
 * URLs sin conexión, se sirven desde caché.
 *
 * ⚠️ LICENCIA: el plan gratuito de Thunderforest restringe la descarga masiva /
 * cacheo de tiles. Antes de publicar, revisar los términos del plan en uso.
 */

export interface OfflineRegionInput {
  name: string;
  /** Estilo Thunderforest (debe coincidir con el que usa el MapView para que el caché sirva). */
  layer: string;
  /** Esquinas [lon, lat]. */
  bounds: { ne: [number, number]; sw: [number, number] };
  minZoom: number;
  maxZoom: number;
}

export interface OfflinePackInfo {
  name: string;
  layer?: string;
  percentage: number;
  completedTileCount: number;
  completedTileSizeBytes: number;
}

// El límite por defecto (~6000 tiles) se queda corto para una zona de montaña a
// buen zoom; lo subimos. Es solo un tope de seguridad, no reserva memoria.
OfflineManager.setTileCountLimit(60000);

/** Escribe un style JSON local (raster Thunderforest) y devuelve su file:// URL. */
async function writeStyleFile(layer: string): Promise<string> {
  const style = {
    version: 8,
    sources: {
      tf: { type: 'raster', tiles: thunderforestTileUrls(layer), tileSize: 256, maxzoom: 18 },
    },
    layers: [{ id: 'tf-layer', type: 'raster', source: 'tf' }],
  };
  const path = `${cacheDirectory}offline-style-${layer}.json`;
  await writeAsStringAsync(path, JSON.stringify(style));
  return path; // cacheDirectory ya viene como file://
}

/**
 * Inicia la descarga de un área. `createPack` resuelve al REGISTRAR el pack; la
 * descarga continúa en segundo plano y el progreso llega por `onProgress`
 * (0–100). Errores por `onError`.
 */
export async function downloadOfflineRegion(
  input: OfflineRegionInput,
  onProgress: (pct: number, tiles: number, bytes: number) => void,
  onError: (message: string) => void,
): Promise<void> {
  const styleURL = await writeStyleFile(input.layer);
  await OfflineManager.createPack(
    {
      name: input.name,
      styleURL,
      bounds: [input.bounds.ne, input.bounds.sw],
      minZoom: input.minZoom,
      maxZoom: input.maxZoom,
      metadata: { layer: input.layer },
    },
    (_pack, status) => onProgress(status.percentage, status.completedTileCount, status.completedTileSize),
    (_pack, err) => onError(typeof err === 'string' ? err : (err?.message ?? 'Error al descargar el área')),
  );
}

export async function listOfflinePacks(): Promise<OfflinePackInfo[]> {
  const packs = await OfflineManager.getPacks();
  const out: OfflinePackInfo[] = [];
  for (const p of packs) {
    const s = await p.status();
    out.push({
      name: p.name ?? '(sin nombre)',
      layer: (p.metadata as { layer?: string } | null)?.layer,
      percentage: s.percentage,
      completedTileCount: s.completedTileCount,
      completedTileSizeBytes: s.completedTileSize,
    });
  }
  return out;
}

export async function deleteOfflinePack(name: string): Promise<void> {
  await OfflineManager.deletePack(name);
}

/** Estimación grosera de nº de tiles para un bbox + rango de zoom (para mostrar tamaño antes de bajar). */
export function estimateTiles(bounds: { ne: [number, number]; sw: [number, number] }, minZoom: number, maxZoom: number): number {
  const lon2tile = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * Math.pow(2, z));
  const lat2tile = (lat: number, z: number) => {
    const r = (lat * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * Math.pow(2, z));
  };
  let total = 0;
  for (let z = minZoom; z <= maxZoom; z++) {
    const x1 = lon2tile(bounds.sw[0], z), x2 = lon2tile(bounds.ne[0], z);
    const y1 = lat2tile(bounds.ne[1], z), y2 = lat2tile(bounds.sw[1], z);
    total += (Math.abs(x2 - x1) + 1) * (Math.abs(y2 - y1) + 1);
  }
  return total;
}
