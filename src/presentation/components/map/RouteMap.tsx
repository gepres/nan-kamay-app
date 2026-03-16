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
} from '@maplibre/maplibre-react-native';
import { thunderforestTileUrl } from '@infrastructure/config/env';
import { GpsPoint } from '@core/entities/GpsPoint';
import { Waypoint } from '@core/entities/Waypoint';

if (typeof setAccessToken === 'function') setAccessToken(null);

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

  const tileUrl = thunderforestTileUrl();

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
          tileUrlTemplates={[tileUrl]}
          tileSize={256}
          maxZoomLevel={18}
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
              style={{ lineColor: '#22C55E', lineWidth: 3, lineCap: 'round', lineJoin: 'round' }}
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
              style={{ circleRadius: 6, circleColor: '#22C55E', circleStrokeColor: '#fff', circleStrokeWidth: 2 }}
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
              style={{ circleRadius: 5, circleColor: '#F59E0B', circleStrokeColor: '#fff', circleStrokeWidth: 2 }}
            />
          </ShapeSource>
        )}
      </MapView>
    </View>
  );
}
