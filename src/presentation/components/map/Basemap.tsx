import { RasterSource, RasterLayer } from '@maplibre/maplibre-react-native';
import { thunderforestTileUrls } from '@infrastructure/config/env';

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
  return (
    <RasterSource
      key={layer}
      id={`bm-${layer}`}
      tileUrlTemplates={thunderforestTileUrls(layer)}
      tileSize={256}
      maxZoomLevel={18}
      minZoomLevel={1}
    >
      <RasterLayer id={`bm-${layer}-layer`} sourceID={`bm-${layer}`} style={{ rasterOpacity }} />
    </RasterSource>
  );
}
