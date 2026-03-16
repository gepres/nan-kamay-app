import { StyleSheet, View } from 'react-native';
import {
  MapView,
  Camera,
  RasterSource,
  RasterLayer,
  ShapeSource,
  LineLayer,
  CircleLayer,
  setAccessToken,
  Logger,
} from '@maplibre/maplibre-react-native';
import { thunderforestTileUrls } from '@infrastructure/config/env';
import { GpsPoint } from '@core/entities/GpsPoint';
import { Waypoint } from '@core/entities/Waypoint';
import { colors } from '@presentation/theme/colors';

if (typeof setAccessToken === 'function') setAccessToken(null);

// Silenciar errores de tile (timeouts de red son reintentos normales, no crashes)
Logger.setLogCallback((log) => {
  if (log.message?.includes('Failed to load tile')) return true;
  return false;
});

interface Props {
  gpsPoints: GpsPoint[];
  waypoints?: Waypoint[];
  centerCoordinate?: [number, number];
  zoomLevel?: number;
}

export default function RouteMap({
  gpsPoints,
  waypoints = [],
  centerCoordinate,
  zoomLevel = 14,
}: Props) {
  const coords = gpsPoints.map((p) => [p.longitude, p.latitude]);

  const routeGeoJson: GeoJSON.Feature<GeoJSON.LineString> = {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: coords },
    properties: {},
  };

  const waypointsGeoJson: GeoJSON.FeatureCollection<GeoJSON.Point> = {
    type: 'FeatureCollection',
    features: waypoints.map((wp) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [wp.longitude, wp.latitude] },
      properties: { title: wp.title },
    })),
  };

  const bounds =
    coords.length > 1
      ? {
          ne: [Math.max(...coords.map((c) => c[0])), Math.max(...coords.map((c) => c[1]))] as [number, number],
          sw: [Math.min(...coords.map((c) => c[0])), Math.min(...coords.map((c) => c[1]))] as [number, number],
          paddingLeft: 40,
          paddingRight: 40,
          paddingTop: 40,
          paddingBottom: 40,
        }
      : undefined;

  const tileUrls = thunderforestTileUrls();

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
        <RasterSource
          id="thunderforest-route"
          tileUrlTemplates={tileUrls}
          tileSize={256}
          maxZoomLevel={18}
          minZoomLevel={1}
        >
          <RasterLayer
            id="thunderforest-route-layer"
            sourceID="thunderforest-route"
            style={{ rasterOpacity: 1 }}
          />
        </RasterSource>

        <Camera
          {...(bounds
            ? { bounds }
            : {
                centerCoordinate: centerCoordinate ?? [coords[0]?.[0] ?? 0, coords[0]?.[1] ?? 0],
                zoomLevel,
              })}
          animationMode="moveTo"
        />

        {coords.length > 1 && (
          <ShapeSource id="route-preview" shape={routeGeoJson}>
            <LineLayer
              id="route-preview-line"
              style={{ lineColor: colors.accent, lineWidth: 3, lineCap: 'round', lineJoin: 'round' }}
            />
          </ShapeSource>
        )}

        {coords.length > 0 && (
          <ShapeSource
            id="route-start"
            shape={{ type: 'Feature', geometry: { type: 'Point', coordinates: coords[0] }, properties: {} }}
          >
            <CircleLayer
              id="start-dot"
              style={{ circleRadius: 6, circleColor: colors.accent, circleStrokeColor: '#fff', circleStrokeWidth: 2 }}
            />
          </ShapeSource>
        )}

        {coords.length > 1 && (
          <ShapeSource
            id="route-end"
            shape={{ type: 'Feature', geometry: { type: 'Point', coordinates: coords[coords.length - 1] }, properties: {} }}
          >
            <CircleLayer
              id="end-dot"
              style={{ circleRadius: 6, circleColor: '#EF4444', circleStrokeColor: '#fff', circleStrokeWidth: 2 }}
            />
          </ShapeSource>
        )}

        {waypointsGeoJson.features.length > 0 && (
          <ShapeSource id="route-waypoints" shape={waypointsGeoJson}>
            <CircleLayer
              id="waypoints-layer"
              style={{ circleRadius: 5, circleColor: colors.accent, circleStrokeColor: '#fff', circleStrokeWidth: 2 }}
            />
          </ShapeSource>
        )}
      </MapView>
    </View>
  );
}
