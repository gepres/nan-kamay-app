import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  MapView, Camera, RasterSource, RasterLayer, ShapeSource, LineLayer,
  setAccessToken, Logger,
} from '@maplibre/maplibre-react-native';
import { thunderforestTileUrls } from '@infrastructure/config/env';
import { colors } from '@presentation/theme/colors';
import MissingTileKeyBanner from '@presentation/components/map/MissingTileKeyBanner';

if (typeof setAccessToken === 'function') setAccessToken(null);
Logger.setLogCallback((log) => {
  if (log.message?.includes('Failed to load tile')) return true;
  if (log.message?.includes('permanent error: Canceled')) return true;
  return false;
});

interface Props {
  /** Polilíneas `[lon,lat][]` de las rutas del usuario. */
  polylines: [number, number][][];
}

/**
 * Mapa de calor personal: superpone todas las trazas del usuario con baja
 * opacidad (el solape construye la "intensidad"). Una sola capa MultiLineString
 * → eficiente aunque haya muchas rutas. No interactivo.
 */
export default function PersonalHeatmap({ polylines }: Props) {
  const shape = useMemo<GeoJSON.Feature<GeoJSON.MultiLineString>>(
    () => ({ type: 'Feature', geometry: { type: 'MultiLineString', coordinates: polylines }, properties: {} }),
    [polylines],
  );

  const bounds = useMemo(() => {
    const flat = polylines.flat();
    if (flat.length < 2) return null;
    const lons = flat.map((c) => c[0]);
    const lats = flat.map((c) => c[1]);
    return {
      ne: [Math.max(...lons), Math.max(...lats)] as [number, number],
      sw: [Math.min(...lons), Math.min(...lats)] as [number, number],
      paddingLeft: 30, paddingRight: 30, paddingTop: 30, paddingBottom: 30,
    };
  }, [polylines]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        style={StyleSheet.absoluteFill}
        logoEnabled={false}
        attributionEnabled={false}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
      >
        <RasterSource id="heatmap-tiles" tileUrlTemplates={thunderforestTileUrls()} tileSize={256} maxZoomLevel={18} minZoomLevel={1}>
          <RasterLayer id="heatmap-tile-layer" sourceID="heatmap-tiles" style={{ rasterOpacity: 0.85 }} />
        </RasterSource>

        <Camera
          {...(bounds ? { bounds } : { centerCoordinate: [-75.0152, -9.19], zoomLevel: 5 })}
          animationMode="moveTo"
        />

        {polylines.length > 0 && (
          <ShapeSource id="heatmap-tracks" shape={shape}>
            {/* Halo ancho tenue + traza fina: el solape de varias rutas intensifica el color */}
            <LineLayer id="heatmap-glow" style={{ lineColor: colors.accent, lineWidth: 7, lineOpacity: 0.18, lineCap: 'round', lineJoin: 'round' }} />
            <LineLayer id="heatmap-core" style={{ lineColor: '#FF6A00', lineWidth: 2.5, lineOpacity: 0.7, lineCap: 'round', lineJoin: 'round' }} />
          </ShapeSource>
        )}
      </MapView>
      <MissingTileKeyBanner />
    </View>
  );
}
