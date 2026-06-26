/**
 * Catálogo de regiones de mapa offline (PMTiles) y assets compartidos.
 *
 * Flujo de preparación (ops, una sola vez por región):
 *  1. Generar el .pmtiles de la zona con go-pmtiles (extract por bbox desde el
 *     daily build de Protomaps — solo descarga los tiles de la caja, no el
 *     planeta). Gratis, OSM/ODbL.
 *  2. El "assets pack" (zip con `fonts/` y `sprites/`) es común a todas las
 *     regiones (Noto Sans + sprites/v4/light); se sube una sola vez.
 *  3. Hospedar los .pmtiles y pegar sus URLs públicas abajo. Las regiones de
 *     trekking nuevas viven en GitHub Releases (gepres/nan-kamay-maps); las
 *     primeras tres siguen en Supabase Storage (bucket `nk-maps`).
 */

export interface OfflineRegionCatalogItem {
  id: string;
  name: string;
  /** Subtítulo corto: qué cubre (lugares clave) — para la lista didáctica. */
  blurb?: string;
  /** Caja [oeste, sur, este, norte] en grados (cobertura y previsualización). */
  bbox: [number, number, number, number];
  /** URL pública del .pmtiles hosteado. */
  url: string;
  /** Tamaño aproximado en bytes (para mostrar antes de descargar). */
  sizeBytes: number;
}

/**
 * URL del "assets pack" (zip con `fonts/` y `sprites/`), común a todas las
 * regiones. Se descarga una sola vez la primera vez que bajas una zona.
 */
export const OFFLINE_ASSETS_PACK_URL = 'https://xyemkrcqpbqpaujifjpp.supabase.co/storage/v1/object/public/nk-maps/assets-pack.zip';

/** Rutas relativas dentro del assets pack (ajustar si tu zip difiere). */
export const OFFLINE_GLYPHS_TEMPLATE = 'fonts/{fontstack}/{range}.pbf';
export const OFFLINE_SPRITE_PATH = 'sprites/v4/light';

/** Base de las regiones nuevas hospedadas en GitHub Releases. */
const GH = 'https://github.com/gepres/nan-kamay-maps/releases/download/maps-v1';
/** Base de las tres primeras regiones (Supabase Storage). */
const SB = 'https://xyemkrcqpbqpaujifjpp.supabase.co/storage/v1/object/public/nk-maps';

/**
 * Regiones disponibles para descargar. La pantalla las reordena por cercanía a
 * tu ubicación y permite buscarlas por nombre, así que el orden aquí solo es el
 * de respaldo (sin GPS): Cusco primero, luego el resto del país.
 */
export const OFFLINE_REGION_CATALOG: OfflineRegionCatalogItem[] = [
  {
    id: 'cusco-centro',
    name: 'Cusco — Centro histórico',
    blurb: 'Plaza de Armas, San Blas y centro histórico',
    bbox: [-72.01, -13.55, -71.94, -13.49],
    url: `${SB}/cusco-centro.pmtiles`,
    sizeBytes: 1_817_559,
  },
  {
    id: 'cusco-provincia',
    name: 'Cusco — Provincia',
    blurb: 'Cusco, San Jerónimo, San Sebastián, Poroy, Saylla',
    bbox: [-72.18, -13.68, -71.78, -13.42],
    url: `${SB}/cusco-provincia.pmtiles`,
    sizeBytes: 6_313_359,
  },
  {
    id: 'urubamba-valle',
    name: 'Valle Sagrado — Urubamba',
    blurb: 'Chinchero, Maras, Urubamba, Ollantaytambo, Pisac',
    bbox: [-72.45, -13.45, -71.80, -13.10],
    url: `${SB}/urubamba-valle.pmtiles`,
    sizeBytes: 7_219_072,
  },
  {
    id: 'machu-picchu',
    name: 'Machu Picchu — Santuario',
    blurb: 'Santuario, Aguas Calientes y final del Camino Inca',
    bbox: [-72.62, -13.30, -72.42, -13.10],
    url: `${GH}/machu-picchu.pmtiles`,
    sizeBytes: 1_356_520,
  },
  {
    id: 'salkantay',
    name: 'Salkantay — Trek',
    blurb: 'Mollepata, Soraypampa, abra Salkantay, Santa Teresa',
    bbox: [-72.70, -13.55, -72.45, -13.10],
    url: `${GH}/salkantay.pmtiles`,
    sizeBytes: 2_081_363,
  },
  {
    id: 'ausangate-vinicunca',
    name: 'Ausangate y Vinicunca',
    blurb: 'Vinicunca, Ausangate, Palccoyo, Tinki, Pacchanta',
    bbox: [-71.45, -14.00, -71.10, -13.65],
    url: `${GH}/ausangate-vinicunca.pmtiles`,
    sizeBytes: 1_758_662,
  },
  {
    id: 'colca-canon',
    name: 'Colca — Cañón (Arequipa)',
    blurb: 'Chivay, Cabanaconde, Cruz del Cóndor, el cañón',
    bbox: [-72.10, -15.75, -71.50, -15.35],
    url: `${GH}/colca-canon.pmtiles`,
    sizeBytes: 1_796_639,
  },
  {
    id: 'huaraz-cordillera-blanca',
    name: 'Huaraz — Cordillera Blanca',
    blurb: 'Huaraz, Llanganuco, Laguna 69, trek Santa Cruz',
    bbox: [-77.75, -9.60, -77.30, -8.80],
    url: `${GH}/huaraz-cordillera-blanca.pmtiles`,
    sizeBytes: 5_548_739,
  },
];
