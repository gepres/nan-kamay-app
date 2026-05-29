import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  Dimensions, StyleSheet, Image, ScrollView, StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withSpring, withDelay,
  runOnJS, Easing,
} from 'react-native-reanimated';
import {
  MapView, Camera, RasterSource, RasterLayer,
  ShapeSource, LineLayer, CircleLayer,
  setAccessToken, Logger,
  type CameraRef,
} from '@maplibre/maplibre-react-native';
import { thunderforestTileUrls } from '@infrastructure/config/env';
import { routeRepository } from '@infrastructure/repositories/RouteRepositoryImpl';
import { getPublicRouteDetailUseCase } from '@application/routes/GetPublicRouteDetailUseCase';
import { Route } from '@core/entities/Route';
import { GpsPoint } from '@core/entities/GpsPoint';
import { Waypoint } from '@core/entities/Waypoint';
import { fastDistanceMeters } from '@shared/utils/geometry';
import { formatDistance, formatDuration, formatElevation } from '@shared/utils/formatters';
import { colors } from '@presentation/theme/colors';
import MissingTileKeyBanner from '@presentation/components/map/MissingTileKeyBanner';
import WaypointIcon from '@presentation/components/ui/WaypointIcon';
import { getWaypointTypeInfo } from '@shared/constants/waypointTypes';

if (typeof setAccessToken === 'function') setAccessToken(null);
Logger.setLogCallback((log) => {
  if (log.message?.includes('Failed to load tile')) return true;
  if (log.message?.includes('permanent error: Canceled')) return true;
  return false;
});

const { width: SCREEN_W } = Dimensions.get('window');

/** Duración total objetivo del replay a velocidad 1×, en segundos. */
const TARGET_DURATION_SEC_1X = 30;
/** Periodo de actualización de la animación (ms). */
const TICK_MS = 80;
/** Radio (m) bajo el cual se considera que cruzamos un waypoint y debe pausar. */
const WAYPOINT_TRIGGER_RADIUS_M = 25;

type Phase = 'loading' | 'intro' | 'playing' | 'paused' | 'waypoint' | 'ended';

export default function ReplayScreen() {
  const { id, public: publicParam } = useLocalSearchParams<{ id: string; public?: string }>();
  const isPublic = publicParam === '1';
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraRef>(null);

  const [route, setRoute] = useState<Route | null>(null);
  const [gpsPoints, setGpsPoints] = useState<GpsPoint[]>([]);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [phase, setPhase] = useState<Phase>('loading');
  const [speed, setSpeed] = useState<1 | 2 | 4>(1);

  // Posición flotante en la polilínea (se discretiza con Math.floor al pintar).
  const [progressIdx, setProgressIdx] = useState(0);
  const progressIdxRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Waypoints ya mostrados (no se vuelven a abrir si pasamos por encima otra vez).
  const shownWaypointIdsRef = useRef<Set<string>>(new Set());
  const [activeWaypoint, setActiveWaypoint] = useState<Waypoint | null>(null);

  // ── Carga inicial ──────────────────────────────────────────────
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

    loader.then(([r, gps, wps]) => {
      setRoute(r);
      setGpsPoints(gps);
      setWaypoints(wps);
      setPhase('intro');
    }).catch(() => {
      setPhase('ended');
    });
  }, [id, isPublic]);

  // ── Intro: zoom al punto de inicio, después arrancar ──────────
  useEffect(() => {
    if (phase !== 'intro' || gpsPoints.length === 0) return;
    const start = gpsPoints[0];
    cameraRef.current?.setCamera({
      centerCoordinate: [start.longitude, start.latitude],
      zoomLevel: 17,
      animationDuration: 1800,
      animationMode: 'flyTo',
    });
    const t = setTimeout(() => setPhase('playing'), 2200);
    return () => clearTimeout(t);
  }, [phase, gpsPoints]);

  // ── Tick de animación ──────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing' || gpsPoints.length < 2) return;

    const N = gpsPoints.length - 1; // índice máximo
    const ptsPerSecond = N / TARGET_DURATION_SEC_1X;
    const advancePerTick = (ptsPerSecond * speed * TICK_MS) / 1000;

    tickRef.current = setInterval(() => {
      const next = Math.min(progressIdxRef.current + advancePerTick, N);
      progressIdxRef.current = next;
      setProgressIdx(next);

      const i = Math.floor(next);
      const p = gpsPoints[i];

      // Cámara: solo recentramos cada ~3 índices para no saturar
      // (setCamera anima ~250ms; spam crea jank).
      if (i % 3 === 0 && cameraRef.current) {
        cameraRef.current.setCamera({
          centerCoordinate: [p.longitude, p.latitude],
          zoomLevel: 17,
          animationDuration: 350,
        });
      }

      // ¿Cruzamos un waypoint no mostrado?
      const hit = waypoints.find((wp) =>
        !shownWaypointIdsRef.current.has(wp.id) &&
        fastDistanceMeters(p.latitude, p.longitude, wp.latitude, wp.longitude) <
          WAYPOINT_TRIGGER_RADIUS_M
      );
      if (hit) {
        shownWaypointIdsRef.current.add(hit.id);
        setActiveWaypoint(hit);
        setPhase('waypoint');
        return;
      }

      if (next >= N) {
        setPhase('ended');
      }
    }, TICK_MS);

    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [phase, gpsPoints, waypoints, speed]);

  // ── Fin: hacer fit-bounds para mostrar toda la ruta ───────────
  useEffect(() => {
    if (phase !== 'ended' || gpsPoints.length < 2) return;
    const lons = gpsPoints.map((p) => p.longitude);
    const lats = gpsPoints.map((p) => p.latitude);
    cameraRef.current?.fitBounds(
      [Math.max(...lons), Math.max(...lats)],
      [Math.min(...lons), Math.min(...lats)],
      [120, 60, 240, 60], // padding [top, right, bottom, left]
      1200,
    );
  }, [phase, gpsPoints]);

  // ── Handlers ──────────────────────────────────────────────────
  const handleClose = useCallback(() => router.back(), []);

  const handlePlayPause = useCallback(() => {
    setPhase((p) => (p === 'playing' ? 'paused' : p === 'paused' ? 'playing' : p));
  }, []);

  const handleSpeed = useCallback(() => {
    setSpeed((s) => (s === 1 ? 2 : s === 2 ? 4 : 1));
  }, []);

  const handleWaypointContinue = useCallback(() => {
    setActiveWaypoint(null);
    setPhase('playing');
  }, []);

  const handleRestart = useCallback(() => {
    progressIdxRef.current = 0;
    shownWaypointIdsRef.current.clear();
    setProgressIdx(0);
    setPhase('intro');
  }, []);

  // ── Datos derivados para el render ───────────────────────────
  const traveledCoords = useMemo(() => {
    const i = Math.floor(progressIdx);
    if (i < 1) return [];
    return gpsPoints.slice(0, i + 1).map((p) => [p.longitude, p.latitude]);
  }, [progressIdx, gpsPoints]);

  const fullCoords = useMemo(
    () => gpsPoints.map((p) => [p.longitude, p.latitude]),
    [gpsPoints],
  );

  const currentPoint = gpsPoints[Math.floor(progressIdx)];
  const startPoint = gpsPoints[0];
  const endPoint = gpsPoints[gpsPoints.length - 1];

  const traveledGeoJson: GeoJSON.Feature<GeoJSON.LineString> | null =
    traveledCoords.length > 1
      ? { type: 'Feature', geometry: { type: 'LineString', coordinates: traveledCoords }, properties: {} }
      : null;

  const fullGeoJson: GeoJSON.Feature<GeoJSON.LineString> | null =
    fullCoords.length > 1
      ? { type: 'Feature', geometry: { type: 'LineString', coordinates: fullCoords }, properties: {} }
      : null;

  const waypointsGeoJson: GeoJSON.FeatureCollection<GeoJSON.Point> = {
    type: 'FeatureCollection',
    features: waypoints.map((wp) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [wp.longitude, wp.latitude] },
      properties: { title: wp.title, id: wp.id },
    })),
  };

  if (phase === 'loading' || !route) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.bgPrimary, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  const progressPct = gpsPoints.length > 1
    ? Math.min(1, progressIdx / (gpsPoints.length - 1))
    : 0;

  return (
    <View style={[styles.fill, { backgroundColor: '#000' }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <MapView
        style={StyleSheet.absoluteFill}
        logoEnabled={false}
        attributionEnabled={false}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
      >
        <RasterSource
          id="replay-tiles"
          tileUrlTemplates={thunderforestTileUrls()}
          tileSize={256}
          maxZoomLevel={18}
          minZoomLevel={1}
        >
          <RasterLayer id="replay-tile-layer" sourceID="replay-tiles" style={{ rasterOpacity: 1 }} />
        </RasterSource>

        <Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: startPoint
              ? [startPoint.longitude, startPoint.latitude]
              : [-75.0152, -9.19],
            zoomLevel: 14,
          }}
        />

        {/* Traza completa (gris debajo) */}
        {fullGeoJson && (
          <ShapeSource id="replay-full" shape={fullGeoJson}>
            <LineLayer
              id="replay-full-line"
              style={{
                lineColor: '#FFFFFF',
                lineOpacity: 0.25,
                lineWidth: 4,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </ShapeSource>
        )}

        {/* Tramo recorrido (naranja encima) */}
        {traveledGeoJson && (
          <ShapeSource id="replay-traveled" shape={traveledGeoJson}>
            <LineLayer
              id="replay-traveled-line"
              style={{
                lineColor: colors.accent,
                lineWidth: 5,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </ShapeSource>
        )}

        {/* Punto de inicio */}
        {startPoint && (
          <ShapeSource
            id="replay-start"
            shape={{
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [startPoint.longitude, startPoint.latitude] },
              properties: {},
            }}
          >
            <CircleLayer
              id="replay-start-circle"
              style={{
                circleRadius: 7,
                circleColor: colors.success,
                circleStrokeColor: '#fff',
                circleStrokeWidth: 2,
              }}
            />
          </ShapeSource>
        )}

        {/* Punto de fin */}
        {endPoint && phase === 'ended' && (
          <ShapeSource
            id="replay-end"
            shape={{
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [endPoint.longitude, endPoint.latitude] },
              properties: {},
            }}
          >
            <CircleLayer
              id="replay-end-circle"
              style={{
                circleRadius: 7,
                circleColor: '#EF4444',
                circleStrokeColor: '#fff',
                circleStrokeWidth: 2,
              }}
            />
          </ShapeSource>
        )}

        {/* Dot móvil con doble halo para sensación de profundidad */}
        {currentPoint && phase !== 'ended' && (
          <ShapeSource
            id="replay-cursor"
            shape={{
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [currentPoint.longitude, currentPoint.latitude] },
              properties: {},
            }}
          >
            <CircleLayer
              id="replay-cursor-halo-outer"
              style={{
                circleRadius: 28,
                circleColor: '#F59E0B15',
                circleStrokeColor: '#F59E0B25',
                circleStrokeWidth: 1,
              }}
            />
            <CircleLayer
              id="replay-cursor-halo-inner"
              style={{
                circleRadius: 17,
                circleColor: '#F59E0B30',
                circleStrokeColor: '#F59E0B55',
                circleStrokeWidth: 1,
              }}
            />
            <CircleLayer
              id="replay-cursor-dot"
              style={{
                circleRadius: 9,
                circleColor: colors.accent,
                circleStrokeColor: '#fff',
                circleStrokeWidth: 3,
              }}
            />
          </ShapeSource>
        )}

        {/* Waypoints */}
        {waypointsGeoJson.features.length > 0 && (
          <ShapeSource id="replay-waypoints" shape={waypointsGeoJson}>
            <CircleLayer
              id="replay-wp-circles"
              style={{
                circleRadius: 6,
                circleColor: colors.accent,
                circleStrokeColor: '#fff',
                circleStrokeWidth: 2,
              }}
            />
          </ShapeSource>
        )}
      </MapView>

      <MissingTileKeyBanner />

      {/* ── Header: cerrar + título ──────────────────────────── */}
      <View style={{
        position: 'absolute',
        top: insets.top + 12,
        left: 16,
        right: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}>
        <TouchableOpacity
          onPress={handleClose}
          style={{
            width: 40, height: 40, borderRadius: 20,
            backgroundColor: '#0D1B12CC',
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 1, borderColor: '#2D6A4F80',
          }}
        >
          <Ionicons name="close" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{
          flex: 1,
          backgroundColor: '#0D1B12CC',
          borderRadius: 12,
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderWidth: 1, borderColor: '#2D6A4F80',
        }}>
          <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '600' }}>PREVISUALIZANDO</Text>
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }} numberOfLines={1}>
            {route.name}
          </Text>
        </View>
      </View>

      {/* ── Intro overlay ───────────────────────────────────── */}
      {phase === 'intro' && (
        <IntroOverlay name={route.name} insetsTop={insets.top} />
      )}

      {/* ── Waypoint overlay (cinematográfico, full-screen) ── */}
      {activeWaypoint && (
        <WaypointOverlay
          waypoint={activeWaypoint}
          index={waypoints.findIndex((w) => w.id === activeWaypoint.id)}
          total={waypoints.length}
          onContinue={handleWaypointContinue}
          insetsBottom={insets.bottom}
        />
      )}

      {/* ── End overlay con stats ───────────────────────────── */}
      {phase === 'ended' && (
        <EndOverlay
          route={route}
          gpsPointsCount={gpsPoints.length}
          waypointsCount={waypoints.length}
          onRestart={handleRestart}
          onClose={handleClose}
          insetsBottom={insets.bottom}
        />
      )}

      {/* ── Controles inferiores (solo durante playing/paused) ── */}
      {(phase === 'playing' || phase === 'paused') && (
        <View style={{
          position: 'absolute',
          bottom: insets.bottom + 24,
          left: 16,
          right: 16,
          backgroundColor: '#0D1B12EE',
          borderRadius: 18,
          borderWidth: 1,
          borderColor: '#2D6A4F80',
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: 16,
          gap: 12,
        }}>
          {/* Progress bar */}
          <View style={{ height: 4, backgroundColor: '#FFFFFF20', borderRadius: 2, overflow: 'hidden' }}>
            <View style={{
              width: `${progressPct * 100}%`,
              height: '100%',
              backgroundColor: colors.accent,
            }} />
          </View>

          {/* Botones */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <TouchableOpacity
              onPress={handleSpeed}
              style={{
                paddingHorizontal: 14, paddingVertical: 8,
                borderRadius: 10, backgroundColor: colors.bgCard,
                borderWidth: 1, borderColor: colors.border,
                minWidth: 56, alignItems: 'center',
              }}
            >
              <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 14 }}>
                {speed}×
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handlePlayPause}
              style={{
                width: 56, height: 56, borderRadius: 28,
                backgroundColor: colors.accent,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Ionicons
                name={phase === 'playing' ? 'pause' : 'play'}
                size={26}
                color="#0D1B12"
                style={{ marginLeft: phase === 'playing' ? 0 : 3 }}
              />
            </TouchableOpacity>

            <View style={{
              paddingHorizontal: 12, paddingVertical: 8,
              borderRadius: 10, backgroundColor: colors.bgCard,
              borderWidth: 1, borderColor: colors.border,
              minWidth: 56, alignItems: 'center',
            }}>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>Punto</Text>
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
                {Math.floor(progressIdx) + 1}/{gpsPoints.length}
              </Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────
// Overlays
// ─────────────────────────────────────────────────────────────────

function IntroOverlay({ name, insetsTop }: { name: string; insetsTop: number }) {
  // Contenedor entra desde abajo con fade.
  const containerOpacity = useSharedValue(0);
  const containerY = useSharedValue(24);

  // El label y el título aparecen escalonados dentro del contenedor para dar
  // sensación de "revelado".
  const labelOpacity = useSharedValue(0);
  const titleOpacity = useSharedValue(0);
  const titleY = useSharedValue(10);

  useEffect(() => {
    containerOpacity.value = withTiming(1, { duration: 500 });
    containerY.value = withSpring(0, { damping: 20, stiffness: 150 });
    // Label entra ~200ms después del contenedor.
    labelOpacity.value = withDelay(200, withTiming(1, { duration: 400 }));
    // Título ~500ms después, con un pequeño slide-up.
    titleOpacity.value = withDelay(500, withTiming(1, { duration: 500 }));
    titleY.value = withDelay(500, withSpring(0, { damping: 18, stiffness: 160 }));
  }, []);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
    transform: [{ translateY: containerY.value }],
  }));
  const labelStyle = useAnimatedStyle(() => ({
    opacity: labelOpacity.value,
  }));
  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleY.value }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          top: insetsTop + 90,
          left: 24,
          right: 24,
          alignItems: 'center',
        },
        containerStyle,
      ]}
    >
      <View style={{
        backgroundColor: '#0D1B12E6',
        borderRadius: 16,
        paddingHorizontal: 22,
        paddingVertical: 16,
        borderWidth: 1,
        borderColor: '#F59E0B40',
      }}>
        <Animated.Text style={[{ color: colors.accent, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textAlign: 'center' }, labelStyle]}>
          INICIO DEL RECORRIDO
        </Animated.Text>
        <Animated.Text style={[{ color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 4, textAlign: 'center' }, titleStyle]}>
          {name}
        </Animated.Text>
      </View>
    </Animated.View>
  );
}

const AnimatedImage = Animated.createAnimatedComponent(Image);

function WaypointOverlay({
  waypoint, index, total, onContinue, insetsBottom,
}: {
  waypoint: Waypoint;
  index: number;
  total: number;
  onContinue: () => void;
  insetsBottom: number;
}) {
  // Entrada de la card (slide + fade).
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(40);

  // Backdrop con duración mayor para sensación más teatral.
  const backdropOpacity = useSharedValue(0);

  // Ken Burns en la imagen: zoom-in suave + pan horizontal lento.
  // ~9 s alcanza para una lectura completa de la descripción.
  const imgScale = useSharedValue(1);
  const imgTx = useSharedValue(0);

  // Entrada escalonada de título y descripción.
  const titleOpacity = useSharedValue(0);
  const titleY = useSharedValue(10);
  const descOpacity = useSharedValue(0);

  useEffect(() => {
    // Reset (vital cuando se reusa el componente con otro waypoint, aunque
    // hoy se desmonta entre uno y otro; futureproof).
    opacity.value = 0;
    translateY.value = 40;
    backdropOpacity.value = 0;
    imgScale.value = 1;
    imgTx.value = 0;
    titleOpacity.value = 0;
    titleY.value = 10;
    descOpacity.value = 0;

    backdropOpacity.value = withTiming(0.6, { duration: 700 });
    opacity.value = withTiming(1, { duration: 450 });
    translateY.value = withSpring(0, { damping: 16, stiffness: 130 });

    // Ken Burns: lineal y largo. translateX puede ir negativo OR positivo;
    // alternamos por id para que no siempre vaya al mismo lado.
    const drift = waypoint.id.charCodeAt(0) % 2 === 0 ? -14 : 14;
    imgScale.value = withTiming(1.18, { duration: 9000, easing: Easing.linear });
    imgTx.value = withTiming(drift, { duration: 9000, easing: Easing.linear });

    titleOpacity.value = withDelay(250, withTiming(1, { duration: 500 }));
    titleY.value = withDelay(250, withSpring(0, { damping: 18, stiffness: 160 }));
    descOpacity.value = withDelay(550, withTiming(1, { duration: 600 }));
  }, [waypoint.id]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));
  const imgStyle = useAnimatedStyle(() => ({
    transform: [{ scale: imgScale.value }, { translateX: imgTx.value }],
  }));
  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleY.value }],
  }));
  const descStyle = useAnimatedStyle(() => ({ opacity: descOpacity.value }));

  const handleContinue = () => {
    // Salida elegante: fade-out + slide hacia abajo, luego callback al padre.
    backdropOpacity.value = withTiming(0, { duration: 300 });
    translateY.value = withTiming(40, { duration: 280 });
    opacity.value = withTiming(0, { duration: 280 }, (finished) => {
      if (finished) runOnJS(onContinue)();
    });
  };

  const hasImage = waypoint.imageUris.length > 0;

  // Datos enriquecidos: tipo (con su icono), altitud y coordenadas.
  const typeInfo = waypoint.type ? getWaypointTypeInfo(waypoint.type) : undefined;
  const typeLabel = (waypoint.type ?? 'Waypoint').toUpperCase();
  const typeIconName = typeInfo?.icon ?? 'MapPin';
  const typeColor = typeInfo?.iconColor ?? colors.accent;
  const coords = `${waypoint.latitude.toFixed(5)}, ${waypoint.longitude.toFixed(5)}`;

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[{ ...StyleSheet.absoluteFillObject, backgroundColor: '#000' }, backdropStyle]}
      />

      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 16, right: 16,
            bottom: insetsBottom + 24,
          },
          cardStyle,
        ]}
      >
        <View style={{
          backgroundColor: colors.bgCard,
          borderRadius: 20,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: '#F59E0B40',
        }}>
          {hasImage && (
            <View style={{ width: '100%', height: SCREEN_W * 0.55, backgroundColor: '#000', overflow: 'hidden' }}>
              <AnimatedImage
                source={{ uri: waypoint.imageUris[0] }}
                style={[{ width: '100%', height: '100%' }, imgStyle]}
                resizeMode="cover"
              />
            </View>
          )}
          <View style={{ padding: 18, gap: 8 }}>
            {/* Tipo (icono real) + contador de waypoints */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <WaypointIcon name={typeIconName} size={18} color={typeColor} />
                <Text style={{ color: typeColor, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>
                  {typeLabel}
                </Text>
              </View>
              {total > 1 && (
                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600' }}>
                  {index + 1} / {total}
                </Text>
              )}
            </View>
            <Animated.Text style={[{ color: '#fff', fontSize: 22, fontWeight: '700' }, titleStyle]}>
              {waypoint.title}
            </Animated.Text>

            {/* Meta: altitud + coordenadas */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14 }}>
              {waypoint.altitude != null && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="trending-up-outline" size={13} color={colors.textMuted} />
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                    {Math.round(waypoint.altitude)} m
                  </Text>
                </View>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="location-outline" size={13} color={colors.textMuted} />
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{coords}</Text>
              </View>
            </View>

            {waypoint.description ? (
              <Animated.View style={descStyle}>
                <ScrollView style={{ maxHeight: 120 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>
                    {waypoint.description}
                  </Text>
                </ScrollView>
              </Animated.View>
            ) : null}

            {waypoint.imageUris.length > 1 && (
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
                +{waypoint.imageUris.length - 1} foto{waypoint.imageUris.length > 2 ? 's' : ''} más
              </Text>
            )}

            <TouchableOpacity
              onPress={handleContinue}
              style={{
                backgroundColor: colors.accent,
                borderRadius: 12,
                paddingVertical: 14,
                alignItems: 'center',
                marginTop: 10,
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <Text style={{ color: '#0D1B12', fontWeight: '700', fontSize: 15 }}>
                Continuar
              </Text>
              <Ionicons name="arrow-forward" size={18} color="#0D1B12" />
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </>
  );
}

function EndOverlay({
  route, gpsPointsCount, waypointsCount, onRestart, onClose, insetsBottom,
}: {
  route: Route;
  gpsPointsCount: number;
  waypointsCount: number;
  onRestart: () => void;
  onClose: () => void;
  insetsBottom: number;
}) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(30);
  // Header (label + título) entran como bloque después del contenedor.
  const headerOpacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 600 });
    translateY.value = withSpring(0, { damping: 18, stiffness: 140 });
    headerOpacity.value = withDelay(150, withTiming(1, { duration: 500 }));
  }, []);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));
  const headerStyle = useAnimatedStyle(() => ({ opacity: headerOpacity.value }));

  const stats = [
    { label: 'Distancia', value: formatDistance(route.distanceMeters) },
    { label: 'Duración', value: formatDuration(route.durationSeconds) },
    { label: 'Subida', value: formatElevation(route.elevationGainMeters) },
    { label: 'Puntos', value: `${gpsPointsCount}` },
    ...(waypointsCount > 0 ? [{ label: 'Waypoints', value: `${waypointsCount}` }] : []),
  ];

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: 16, right: 16,
          bottom: insetsBottom + 24,
          backgroundColor: '#0D1B12F2',
          borderRadius: 18,
          padding: 18,
          borderWidth: 1,
          borderColor: colors.accent + '60',
          gap: 14,
        },
        containerStyle,
      ]}
    >
      <Animated.View style={headerStyle}>
        <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 }}>
          FIN DEL RECORRIDO
        </Text>
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700', marginTop: 2 }} numberOfLines={1}>
          {route.name}
        </Text>
      </Animated.View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {stats.map((s, i) => (
          <Stat key={s.label} label={s.label} value={s.value} delay={400 + i * 90} />
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <TouchableOpacity
          onPress={onRestart}
          style={{
            flex: 1,
            backgroundColor: colors.bgCard,
            borderRadius: 12,
            paddingVertical: 13,
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 8,
            borderWidth: 1, borderColor: colors.border,
          }}
        >
          <Ionicons name="refresh" size={18} color={colors.accent} />
          <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 14 }}>Repetir</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onClose}
          style={{
            flex: 1,
            backgroundColor: colors.accent,
            borderRadius: 12,
            paddingVertical: 13,
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <Text style={{ color: '#0D1B12', fontWeight: '700', fontSize: 14 }}>Cerrar</Text>
          <Ionicons name="checkmark" size={18} color="#0D1B12" />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

function Stat({ label, value, delay = 0 }: { label: string; value: string; delay?: number }) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(12);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 450 }));
    translateY.value = withDelay(delay, withSpring(0, { damping: 18, stiffness: 170 }));
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View
      style={[{
        flex: 1,
        minWidth: '30%',
        backgroundColor: colors.bgCard,
        borderRadius: 10,
        padding: 10,
        borderWidth: 1, borderColor: colors.border,
      }, style]}
    >
      <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{value}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>{label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
