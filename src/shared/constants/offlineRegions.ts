/**
 * Catálogo de regiones de mapa offline (PMTiles) y assets compartidos.
 *
 * Flujo de preparación (ops, una sola vez por región):
 *  1. Generar el .pmtiles de la zona en https://app.protomaps.com (dibujar
 *     recuadro → descargar). Gratis, OSM/ODbL.
 *  2. Generar/descargar el "assets pack" (zip con `fonts/` y `sprites/`) desde
 *     https://github.com/protomaps/basemaps-assets (fonts: Noto Sans
 *     Regular/Medium/Italic; sprites/v4/light.{json,png,@2x}).
 *  3. Subir ambos a Supabase Storage (bucket `nk-maps`, público) y pegar las
 *     URLs públicas abajo.
 */

export interface OfflineRegionCatalogItem {
  id: string;
  name: string;
  /** Caja [oeste, sur, este, norte] en grados (solo informativo / cobertura). */
  bbox: [number, number, number, number];
  /** URL pública del .pmtiles hosteado. */
  url: string;
  /** Tamaño aproximado en bytes (para mostrar antes de descargar). */
  sizeBytes: number;
}

/**
 * URL del "assets pack" (zip con `fonts/` y `sprites/`), común a todas las
 * regiones. Se descarga una sola vez la primera vez que bajas una zona.
 * ⚠️ Reemplazar por la URL real de Supabase Storage tras subir el zip.
 */
export const OFFLINE_ASSETS_PACK_URL = '';

/** Rutas relativas dentro del assets pack (ajustar si tu zip difiere). */
export const OFFLINE_GLYPHS_TEMPLATE = 'fonts/{fontstack}/{range}.pbf';
export const OFFLINE_SPRITE_PATH = 'sprites/v4/light';

/**
 * Regiones disponibles para descargar. Rellenar tras hostear los .pmtiles.
 * Ejemplo (descomentar y ajustar):
 */
export const OFFLINE_REGION_CATALOG: OfflineRegionCatalogItem[] = [
  // {
  //   id: 'huanuco',
  //   name: 'Huánuco y alrededores',
  //   bbox: [-76.4, -10.1, -75.6, -9.4],
  //   url: 'https://<proj>.supabase.co/storage/v1/object/public/nk-maps/huanuco.pmtiles',
  //   sizeBytes: 45_000_000,
  // },
];
