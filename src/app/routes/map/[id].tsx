import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, StatusBar, Modal, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import {
  MapView, Camera, RasterSource, RasterLayer,
  ShapeSource, LineLayer, CircleLayer, MarkerView,
  setAccessToken, Logger,
  type CameraRef,
} from '@maplibre/maplibre-react-native';
import { thunderforestTileUrls } from '@infrastructure/config/env';
import { routeRepository } from '@infrastructure/repositories/RouteRepositoryImpl';
import { getPublicRouteDetailUseCase } from '@application/routes/GetPublicRouteDetailUseCase';
import { Route } from '@core/entities/Route';
import { GpsPoint } from '@core/entities/GpsPoint';
import { Waypoint } from '@core/entities/Waypoint';
import { getWaypointTypeInfo } from '@shared/constants/waypointTypes';
import WaypointIcon from '@presentation/components/ui/WaypointIcon';
import WaypointDetailCard from '@presentation/components/routes/WaypointDetailCard';
import MissingTileKeyBanner from '@presentation/components/map/MissingTileKeyBanner';
import LayerSelectorModal from '@presentation/components/map/LayerSelectorModal';
import { colors } from '@presentation/theme/colors';

if (typeof setAccessToken === 'function') setAccessToken(null);
Logger.setLogCallback((log) => {
  if (log.message?.includes('Failed to load tile')) return true;
  if (log.message?.includes('permanent error: Canceled')) return true;
  return false;
});

/** Pin de waypoint en el mapa: círculo con el icono de su tipo + puntero.
 *  La raíz es el touchable y conserva un tamaño FIJO (60×64) para que el anclaje
 *  de MarkerView (anchor y:1 → la punta sobre la coordenada) sea exacto. Envolver
 *  el pin en un touchable externo desalineaba el pin respecto a su punto. */
function WaypointMapPin({ waypoint, active, onPress }: { waypoint: Waypoint; active: boolean; onPress: () => void }) {
  const info = waypoint.type ? getWaypointTypeInfo(waypoint.type) : undefined;
  const iconName = info?.icon ?? 'MapPin';
  const bg = info?.iconColor ?? colors.accent;
  const size = active ? 40 : 30;
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={{ width: 60, height: 64, alignItems: 'center', justifyContent: 'flex-end' }}
    >
      <View
        collapsable={false}
        renderToHardwareTextureAndroid
        style={{
          width: size, height: size, borderRadius: size / 2,
          backgroundColor: bg, borderWidth: active ? 3 : 2, borderColor: '#FFFFFF',
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <WaypointIcon name={iconName} size={active ? 20 : 15} color="#0D1B12" />
      </View>
      <View
        collapsable={false}
        style={{
          width: 0, height: 0,
          borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 7,
          borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#FFFFFF',
          marginTop: -1,
        }}
      />
    </TouchableOpacity>
  );
}

export default function RouteMapScreen() {
  const { id, public: publicParam } = useLocalSearchParams<{ id: string; public?: string }>();
  const isPublic = publicParam === '1';
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraRef>(null);

  const [route, setRoute] = useState<Route | null>(null);
  const [gpsPoints, setGpsPoints] = useState<GpsPoint[]>([]);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [loading, setLoading] = useState(true);

  const [layer, setLayer] = useState('outdoors');
  const [layerModal, setLayerModal] = useState(false);
  const [selectedWp, setSelectedWp] = useState<Waypoint | null>(null);

  // Ubicación del usuario en vivo.
  const [userPos, setUserPos] = useState<{ lon: number; lat: number; accuracy: number | null } | null>(null);

  // ── Carga de la ruta ──
  useEffect(() => {
    if (!id) return;
    const loader: Promise<[Route | null, GpsPoint[], Waypoint[]]> = isPublic
      ? getPublicRouteDetailUseCase(id).then((d) =>
          (d ? [d.route, d.gpsPoints, d.waypoints] : [null, [], []]) as [Route | null, GpsPoint[], Waypoint[]],
        )
      : Promise.all([
          routeRepository.getById(id),
          routeRepository.getGpsPoints(id),
          routeRepository.getWaypoints(id),
        ]);
    loader
      .then(([r, gps, wps]) => { setRoute(r); setGpsPoints(gps); setWaypoints(wps); })
      .finally(() => setLoading(false));
  }, [id, isPublic]);

  // ── Ubicación del usuario (watch en vivo) ──
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || cancelled) return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 5, timeInterval: 3000 },
        (loc) => {
          setUserPos({
            lon: loc.coords.longitude,
            lat: loc.coords.latitude,
            accuracy: loc.coords.accuracy ?? null,
          });
        },
      );
    })();
    return () => { cancelled = true; sub?.remove(); };
  }, []);

  const coords = useMemo(() => gpsPoints.map((p) => [p.longitude, p.latitude]), [gpsPoints]);

  const routeGeoJson = useMemo<GeoJSON.Feature<GeoJSON.LineString> | null>(
    () => (coords.length > 1
      ? { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} }
      : null),
    [coords],
  );

  const fitRoute = useCallback(() => {
    if (coords.length < 2) return;
    const lons = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    cameraRef.current?.fitBounds(
      [Math.max(...lons), Math.max(...lats)],
      [Math.min(...lons), Math.min(...lats)],
      [insets.top + 80, 50, 80, 50],
      800,
    );
  }, [coords, insets.top]);

  // Encuadre inicial a toda la ruta cuando hay puntos.
  useEffect(() => {
    if (loading || coords.length < 2) return;
    const t = setTimeout(fitRoute, 350);
    return () => clearTimeout(t);
  }, [loading, coords, fitRoute]);

  const centerOnUser = useCallback(() => {
    if (!userPos) return;
    cameraRef.current?.setCamera({
      centerCoordinate: [userPos.lon, userPos.lat],
      zoomLevel: 16,
      animationDuration: 600,
    });
  }, [userPos]);

  if (loading || !route) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.bgPrimary, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  const start = coords[0];
  const end = coords[coords.length - 1];

  return (
    <View style={[styles.fill, { backgroundColor: '#000' }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <MapView
        style={StyleSheet.absoluteFill}
        logoEnabled={false}
        attributionEnabled={false}
        onPress={() => setSelectedWp(null)}
      >
        <RasterSource
          key={layer}
          id="route-map-tiles"
          tileUrlTemplates={thunderforestTileUrls(layer)}
          tileSize={256}
          maxZoomLevel={18}
          minZoomLevel={1}
        >
          <RasterLayer id="route-map-tile-layer" sourceID="route-map-tiles" style={{ rasterOpacity: 1 }} />
        </RasterSource>

        <Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: start ?? [-75.0152, -9.19],
            zoomLevel: 14,
          }}
        />

        {/* Línea de ruta */}
        {routeGeoJson && (
          <ShapeSource id="route-map-line" shape={routeGeoJson}>
            <LineLayer
              id="route-map-line-layer"
              style={{ lineColor: colors.accent, lineWidth: 4, lineCap: 'round', lineJoin: 'round' }}
            />
          </ShapeSource>
        )}

        {/* Inicio */}
        {start && (
          <ShapeSource id="route-map-start" shape={{ type: 'Feature', geometry: { type: 'Point', coordinates: start }, properties: {} }}>
            <CircleLayer id="route-map-start-dot" style={{ circleRadius: 7, circleColor: colors.success, circleStrokeColor: '#fff', circleStrokeWidth: 2 }} />
          </ShapeSource>
        )}

        {/* Fin */}
        {coords.length > 1 && end && (
          <ShapeSource id="route-map-end" shape={{ type: 'Feature', geometry: { type: 'Point', coordinates: end }, properties: {} }}>
            <CircleLayer id="route-map-end-dot" style={{ circleRadius: 7, circleColor: '#EF4444', circleStrokeColor: '#fff', circleStrokeWidth: 2 }} />
          </ShapeSource>
        )}

        {/* Ubicación del usuario en vivo: anillo de precisión + punto */}
        {userPos && (
          <ShapeSource
            id="route-map-user"
            shape={{ type: 'Feature', geometry: { type: 'Point', coordinates: [userPos.lon, userPos.lat] }, properties: {} }}
          >
            <CircleLayer id="route-map-user-halo" style={{ circleRadius: 18, circleColor: '#3B82F620', circleStrokeColor: '#3B82F640', circleStrokeWidth: 1 }} />
            <CircleLayer id="route-map-user-dot" style={{ circleRadius: 8, circleColor: '#3B82F6', circleStrokeColor: '#fff', circleStrokeWidth: 3 }} />
          </ShapeSource>
        )}

        {/* Waypoints (pin con icono, tap para detalle) */}
        {waypoints.map((wp) => (
          <MarkerView key={wp.id} coordinate={[wp.longitude, wp.latitude]} anchor={{ x: 0.5, y: 1 }} allowOverlap>
            <WaypointMapPin waypoint={wp} active={selectedWp?.id === wp.id} onPress={() => setSelectedWp(wp)} />
          </MarkerView>
        ))}
      </MapView>

      <MissingTileKeyBanner />

      {/* ── Header ── */}
      <View style={{
        position: 'absolute', top: insets.top + 12, left: 16, right: 16,
        flexDirection: 'row', alignItems: 'center', gap: 12,
      }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.circleBtn}
        >
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{
          flex: 1, backgroundColor: '#0D1B12CC', borderRadius: 12,
          paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#2D6A4F80',
        }}>
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }} numberOfLines={1}>{route.name}</Text>
        </View>
        <TouchableOpacity onPress={() => setLayerModal(true)} style={styles.circleBtn}>
          <Ionicons name="layers-outline" size={20} color={colors.accent} />
        </TouchableOpacity>
      </View>

      {/* ── Botones flotantes derecha: encuadrar ruta + mi ubicación ── */}
      <View style={{ position: 'absolute', right: 16, bottom: insets.bottom + 28, gap: 12 }}>
        <TouchableOpacity onPress={fitRoute} style={styles.fab}>
          <Ionicons name="scan-outline" size={22} color={colors.accent} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={centerOnUser}
          disabled={!userPos}
          style={[styles.fab, { opacity: userPos ? 1 : 0.5 }]}
        >
          <Ionicons name="locate" size={22} color={userPos ? '#3B82F6' : colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* ── Bottom sheet de waypoint seleccionado (con multimedia completa) ── */}
      <Modal
        visible={!!selectedWp}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setSelectedWp(null)}
      >
        <View style={{ flex: 1, backgroundColor: '#00000099', justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setSelectedWp(null)} />
          <View style={{
            backgroundColor: colors.bgPrimary,
            borderTopLeftRadius: 20, borderTopRightRadius: 20,
            paddingTop: 12, paddingHorizontal: 20, paddingBottom: insets.bottom + 16,
            maxHeight: '78%',
          }}>
            {/* Handle */}
            <View style={{ alignItems: 'center', marginBottom: 12 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
            </View>
            {selectedWp && (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
                <WaypointDetailCard
                  wp={selectedWp}
                  onEdit={isPublic ? undefined : () => {
                    const wpId = selectedWp.id;
                    setSelectedWp(null);
                    router.push(`/routes/edit-waypoint/${wpId}`);
                  }}
                />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <LayerSelectorModal
        visible={layerModal}
        selectedLayer={layer}
        onSelect={(k) => { setLayer(k); setLayerModal(false); }}
        onClose={() => setLayerModal(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  circleBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#0D1B12CC',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#2D6A4F80',
  },
  fab: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#0D1B12EE',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#2D6A4F',
  },
});
