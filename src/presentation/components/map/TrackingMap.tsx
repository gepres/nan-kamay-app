import { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
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
  type CameraRef,
  type MapViewRef,
} from '@maplibre/maplibre-react-native';
import { useTrackingStore } from '@presentation/stores/trackingStore';
import { thunderforestTileUrls } from '@infrastructure/config/env';
import { colors } from '@presentation/theme/colors';

if (typeof setAccessToken === 'function') setAccessToken(null);

// Silenciar errores de tile (timeouts de red son reintentos normales, no crashes)
Logger.setLogCallback((log) => {
  if (log.message?.includes('Failed to load tile')) return true;
  return false;
});

export interface TrackingMapHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  resetNorth: () => void;
}

interface Props {
  followUser?: boolean;
  useOutdoorTiles?: boolean;
}

const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export default forwardRef<TrackingMapHandle, Props>(function TrackingMap(
  { followUser = true, useOutdoorTiles = true },
  ref,
) {
  const { gpsPoints, waypoints, currentPosition } = useTrackingStore();
  const cameraRef = useRef<CameraRef>(null);
  const mapViewRef = useRef<MapViewRef>(null);
  const currentZoom = useRef(16);

  useImperativeHandle(ref, () => ({
    zoomIn: () => {
      currentZoom.current = Math.min(currentZoom.current + 1, 18);
      cameraRef.current?.setCamera({
        zoomLevel: currentZoom.current,
        animationDuration: 300,
      });
    },
    zoomOut: () => {
      currentZoom.current = Math.max(currentZoom.current - 1, 1);
      cameraRef.current?.setCamera({
        zoomLevel: currentZoom.current,
        animationDuration: 300,
      });
    },
    resetNorth: () => {
      cameraRef.current?.setCamera({
        heading: 0,
        animationDuration: 300,
      });
    },
  }));

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

  const tileUrls = useOutdoorTiles ? thunderforestTileUrls() : [OSM_TILE_URL];

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        ref={mapViewRef}
        style={StyleSheet.absoluteFill}
        logoEnabled={false}
        attributionEnabled={true}
        compassEnabled={false}
        rotateEnabled={true}
      >
        <RasterSource
          id="tiles"
          tileUrlTemplates={tileUrls}
          tileSize={256}
          maxZoomLevel={18}
          minZoomLevel={1}
        >
          <RasterLayer
            id="tiles-layer"
            sourceID="tiles"
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
});
