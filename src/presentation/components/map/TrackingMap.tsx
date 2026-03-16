import { useRef, useEffect } from 'react';
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
  type CameraRef,
} from '@maplibre/maplibre-react-native';
import { useTrackingStore } from '@presentation/stores/trackingStore';
import { thunderforestTileUrl } from '@infrastructure/config/env';
import { colors } from '@presentation/theme/colors';

// setAccessToken puede ser undefined en Expo Go (requiere dev build)
if (typeof setAccessToken === 'function') setAccessToken(null);

interface Props {
  followUser?: boolean;
}

export default function TrackingMap({ followUser = true }: Props) {
  const { gpsPoints, waypoints, currentPosition } = useTrackingStore();
  const cameraRef = useRef<CameraRef>(null);

  const routeGeoJson: GeoJSON.Feature<GeoJSON.LineString> = {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: gpsPoints.map((p) => [p.longitude, p.latitude]),
    },
    properties: {},
  };

  const startPoint = gpsPoints[0];
  const startGeoJson: GeoJSON.Feature<GeoJSON.Point> | null = startPoint
    ? {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [startPoint.longitude, startPoint.latitude] },
        properties: {},
      }
    : null;

  const currentGeoJson: GeoJSON.Feature<GeoJSON.Point> | null = currentPosition
    ? {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [currentPosition.longitude, currentPosition.latitude],
        },
        properties: {},
      }
    : null;

  const waypointsGeoJson: GeoJSON.FeatureCollection<GeoJSON.Point> = {
    type: 'FeatureCollection',
    features: waypoints.map((wp) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [wp.longitude, wp.latitude] },
      properties: { title: wp.title },
    })),
  };

  useEffect(() => {
    if (followUser && currentPosition && cameraRef.current) {
      cameraRef.current.setCamera({
        centerCoordinate: [currentPosition.longitude, currentPosition.latitude],
        animationDuration: 500,
      });
    }
  }, [currentPosition, followUser]);

  const tileUrl = thunderforestTileUrl();

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        style={StyleSheet.absoluteFill}
        logoEnabled={false}
        attributionEnabled={true}
        compassEnabled={true}
      >
        <RasterSource
          id="thunderforest"
          tileUrlTemplates={[tileUrl]}
          tileSize={256}
          maxZoomLevel={18}
        >
          <RasterLayer
            id="thunderforest-layer"
            sourceID="thunderforest"
            style={{ rasterOpacity: 1 }}
          />
        </RasterSource>

        <Camera
          ref={cameraRef}
          zoomLevel={16}
          centerCoordinate={
            currentPosition
              ? [currentPosition.longitude, currentPosition.latitude]
              : [-75.0152, -9.1900]
          }
          animationMode="flyTo"
        />

        {gpsPoints.length > 1 && (
          <ShapeSource id="route" shape={routeGeoJson}>
            <LineLayer
              id="route-line"
              style={{ lineColor: colors.accent, lineWidth: 4, lineCap: 'round', lineJoin: 'round' }}
            />
          </ShapeSource>
        )}

        {startGeoJson && (
          <ShapeSource id="start-marker" shape={startGeoJson}>
            <CircleLayer
              id="start-circle"
              style={{ circleRadius: 8, circleColor: colors.success, circleStrokeColor: colors.textPrimary, circleStrokeWidth: 2 }}
            />
          </ShapeSource>
        )}

        {currentGeoJson && (
          <ShapeSource id="current-position" shape={currentGeoJson}>
            <CircleLayer
              id="current-pulse"
              style={{ circleRadius: 16, circleColor: '#F59E0B20', circleStrokeColor: '#F59E0B40', circleStrokeWidth: 1 }}
            />
            <CircleLayer
              id="current-dot"
              style={{ circleRadius: 8, circleColor: colors.accent, circleStrokeColor: colors.textPrimary, circleStrokeWidth: 3 }}
            />
          </ShapeSource>
        )}

        {waypointsGeoJson.features.length > 0 && (
          <ShapeSource id="waypoints" shape={waypointsGeoJson}>
            <CircleLayer
              id="waypoint-circles"
              style={{ circleRadius: 7, circleColor: colors.accent, circleStrokeColor: colors.textPrimary, circleStrokeWidth: 2 }}
            />
          </ShapeSource>
        )}
      </MapView>
    </View>
  );
}
