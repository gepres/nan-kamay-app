import { useMemo } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import {
  MapView, Camera, RasterSource, RasterLayer, MarkerView,
  setAccessToken, Logger,
} from '@maplibre/maplibre-react-native';
import { thunderforestTileUrls } from '@infrastructure/config/env';
import type { Zone } from '@application/metrics/computeZones';
import { colors } from '@presentation/theme/colors';
import MissingTileKeyBanner from '@presentation/components/map/MissingTileKeyBanner';

if (typeof setAccessToken === 'function') setAccessToken(null);
Logger.setLogCallback((log) => {
  if (log.message?.includes('Failed to load tile')) return true;
  if (log.message?.includes('permanent error: Canceled')) return true;
  return false;
});

/** Mapa con una burbuja por zona; el tamaño escala con el nº de rutas. No interactivo. */
export default function ClusterMap({ zones }: { zones: Zone[] }) {
  const bounds = useMemo(() => {
    if (zones.length < 2) return null;
    const lons = zones.map((z) => z.lon);
    const lats = zones.map((z) => z.lat);
    return {
      ne: [Math.max(...lons), Math.max(...lats)] as [number, number],
      sw: [Math.min(...lons), Math.min(...lats)] as [number, number],
      paddingLeft: 40, paddingRight: 40, paddingTop: 40, paddingBottom: 40,
    };
  }, [zones]);

  const maxCount = useMemo(() => zones.reduce((m, z) => Math.max(m, z.count), 1), [zones]);
  const center = zones[0] ? [zones[0].lon, zones[0].lat] as [number, number] : [-75.0152, -9.19] as [number, number];

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView style={StyleSheet.absoluteFill} logoEnabled={false} attributionEnabled={false} scrollEnabled={false} zoomEnabled={false} rotateEnabled={false}>
        <RasterSource id="cluster-tiles" tileUrlTemplates={thunderforestTileUrls()} tileSize={256} maxZoomLevel={18} minZoomLevel={1}>
          <RasterLayer id="cluster-tile-layer" sourceID="cluster-tiles" style={{ rasterOpacity: 0.85 }} />
        </RasterSource>
        <Camera {...(bounds ? { bounds } : { centerCoordinate: center, zoomLevel: 11 })} animationMode="moveTo" />

        {zones.map((z) => {
          const size = 30 + Math.round((z.count / maxCount) * 28); // 30..58 px
          return (
            <MarkerView key={z.id} coordinate={[z.lon, z.lat]} anchor={{ x: 0.5, y: 0.5 }} allowOverlap>
              <View collapsable={false} style={{
                width: size, height: size, borderRadius: size / 2,
                backgroundColor: '#F59E0BE6', borderWidth: 2, borderColor: '#FFFFFF',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ color: '#0D1B12', fontSize: size > 44 ? 16 : 13, fontWeight: '800' }}>{z.count}</Text>
              </View>
            </MarkerView>
          );
        })}
      </MapView>
      <MissingTileKeyBanner />
    </View>
  );
}
