import { RasterSource, RasterLayer } from '@maplibre/maplibre-react-native';
import { thunderforestTileUrls } from '@infrastructure/config/env';

/**
 * Imágenes satelitales (Esri World Imagery). No requiere API key. Requiere
 * atribución visible ("© Esri, Maxar, Earthstar Geographics"), que pinta
 * TrackingMap cuando esta capa está activa. Para uso comercial intensivo,
 * considerar una key de ArcGIS o un proveedor con token (Mapbox).
 */
const SATELLITE_TILES = [
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
];

interface BasemapProps {
  /** Estilo raster online de Thunderforest. Default 'outdoors'. */
  layer?: string;
  /**
   * Si el padre ya resolvió que está en modo vector offline (vía `useBasemap`),
   * no renderiza el raster: la base vector llega por `MapView.mapStyle`.
   */
  offlineVector?: boolean;
  rasterOpacity?: number;
}

/**
 * Base del mapa unificada. ONLINE: dibuja los tiles raster de Thunderforest
 * (como hasta ahora). OFFLINE (vector): no dibuja nada — el style vector local
 * lo aporta `MapView.mapStyle`. Las capas overlay (traza, waypoints, guía) se
 * montan como hermanas y funcionan sobre cualquiera de las dos bases.
 *
 * `key={layer}` fuerza el remount del source al cambiar de capa (MapLibre no
 * recarga tiles si solo cambia `tileUrlTemplates` en el mismo source).
 */
export function Basemap({ layer = 'outdoors', offlineVector = false, rasterOpacity = 1 }: BasemapProps) {
  if (offlineVector) return null;
  const isSatellite = layer === 'satellite';
  const tiles = isSatellite ? SATELLITE_TILES : thunderforestTileUrls(layer);
  return (
    <RasterSource
      key={layer}
      id={`bm-${layer}`}
      tileUrlTemplates={tiles}
      tileSize={256}
      maxZoomLevel={isSatellite ? 19 : 18}
      minZoomLevel={1}
    >
      <RasterLayer id={`bm-${layer}-layer`} sourceID={`bm-${layer}`} style={{ rasterOpacity }} />
    </RasterSource>
  );
}
