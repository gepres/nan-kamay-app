/**
 * Map layer definitions matching Thunderforest tile styles.
 * Design source: Pencil → Layer Selector Modal.
 */

export interface MapLayerInfo {
  /** Internal key matching Thunderforest URL path segment */
  key: string;
  /** Display name */
  name: string;
  /** Short description */
  description: string;
  /** Lucide icon name */
  icon: string;
}

export const MAP_LAYERS: MapLayerInfo[] = [
  { key: 'outdoors', name: 'Outdoors', description: 'Senderismo (actual)', icon: 'Mountain' },
  { key: 'satellite', name: 'Satélite', description: 'Imágenes satelitales (Esri)', icon: 'Satellite' },
  { key: 'landscape', name: 'Landscape', description: 'Vista general del terreno', icon: 'Image' },
  { key: 'cycle', name: 'Cycle', description: 'Ciclismo, rutas de bici', icon: 'Bike' },
  { key: 'transport', name: 'Transport', description: 'Transporte público', icon: 'Bus' },
  { key: 'atlas', name: 'Atlas', description: 'Estilo atlas clásico', icon: 'Globe' },
  { key: 'pioneer', name: 'Pioneer', description: 'Estilo vintage/retro', icon: 'Compass' },
  { key: 'neighbourhood', name: 'Neighbourhood', description: 'Detalle urbano', icon: 'Building2' },
  { key: 'mobile-atlas', name: 'Mobile Atlas', description: 'Optimizado para móvil', icon: 'Smartphone' },
  { key: 'spinal-map', name: 'Spinal Map', description: 'Alto contraste', icon: 'Contrast' },
];
