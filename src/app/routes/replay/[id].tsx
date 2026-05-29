import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  Dimensions, StyleSheet, ScrollView, StatusBar, Image, PanResponder,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withSpring, withDelay,
  runOnJS, Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import { useUiStore } from '@presentation/stores/uiStore';
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
import WaypointPhotoCarousel from '@presentation/components/routes/WaypointPhotoCarousel';

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
/** Inclinación de cámara (grados) para el efecto "flythrough" cinematográfico. */
const CAMERA_PITCH = 55;

/** Rumbo (grados, 0=N) de a → b. Para alinear la cámara al avance. */
function bearing(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = Math.PI / 180;
  const φ1 = aLat * toRad, φ2 = bLat * toRad;
  const Δλ = (bLon - aLon) * toRad;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

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

  const { showToast } = useUiStore();
  const mapRef = useRef<any>(null);
  const postalRef = useRef<View>(null);
  const barWidthRef = useRef(0);
  const [postalMapUri, setPostalMapUri] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  // ── Scrubbing: arrastrar la barra de progreso para mover el replay ──
  const seekTo = useCallback((fraction: number) => {
    const N = gpsPoints.length - 1;
    if (N < 1) return;
    const idx = Math.max(0, Math.min(N, fraction * N));
    progressIdxRef.current = idx;
    setProgressIdx(idx);
    const p = gpsPoints[Math.floor(idx)];
    if (p) {
      cameraRef.current?.setCamera({
        centerCoordinate: [p.longitude, p.latitude],
        zoomLevel: 17,
        animationDuration: 0,
      });
    }
  }, [gpsPoints]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          setPhase('paused');
          if (barWidthRef.current > 0) seekTo(e.nativeEvent.locationX / barWidthRef.current);
        },
        onPanResponderMove: (e) => {
          if (barWidthRef.current > 0) seekTo(e.nativeEvent.locationX / barWidthRef.current);
        },
      }),
    [seekTo],
  );

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
      pitch: 0,
      heading: 0,
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
    const baseAdvance = (ptsPerSecond * speed * TICK_MS) / 1000;

    tickRef.current = setInterval(() => {
      const cur = progressIdxRef.current;
      const frac = N > 0 ? cur / N : 0;

      // Easing: arranque y cierre más lentos (sensación cinematográfica).
      let factor = 1;
      if (frac < 0.08) factor = 0.4 + (frac / 0.08) * 0.6;
      else if (frac > 0.92) factor = 0.4 + ((1 - frac) / 0.08) * 0.6;

      // Ralentizar al acercarse a un waypoint aún no mostrado (anticipación).
      const pc = gpsPoints[Math.floor(cur)];
      if (pc) {
        const near = waypoints.some((wp) =>
          !shownWaypointIdsRef.current.has(wp.id) &&
          fastDistanceMeters(pc.latitude, pc.longitude, wp.latitude, wp.longitude) <
            WAYPOINT_TRIGGER_RADIUS_M * 3,
        );
        if (near) factor = Math.min(factor, 0.45);
      }

      const next = Math.min(cur + baseAdvance * factor, N);
      progressIdxRef.current = next;
      setProgressIdx(next);

      const i = Math.floor(next);
      const p = gpsPoints[i];

      // Cámara cinematográfica: tilt + heading alineado al avance.
      // Recentramos cada ~3 índices para no saturar (setCamera anima ~350ms).
      if (i % 3 === 0 && cameraRef.current && p) {
        const ahead = gpsPoints[Math.min(N, i + 4)] ?? p;
        const hdg = bearing(p.latitude, p.longitude, ahead.latitude, ahead.longitude);
        cameraRef.current.setCamera({
          centerCoordinate: [p.longitude, p.latitude],
          zoomLevel: 17,
          pitch: CAMERA_PITCH,
          heading: hdg,
          animationDuration: 350,
        });
      }

      // ¿Cruzamos un waypoint no mostrado?
      const hit = p && waypoints.find((wp) =>
        !shownWaypointIdsRef.current.has(wp.id) &&
        fastDistanceMeters(p.latitude, p.longitude, wp.latitude, wp.longitude) <
          WAYPOINT_TRIGGER_RADIUS_M
      );
      if (hit) {
        shownWaypointIdsRef.current.add(hit.id);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        setActiveWaypoint(hit);
        setPhase('waypoint');
        return;
      }

      if (next >= N) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
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
    // Reset de la cámara cinematográfica (tilt/heading) para un encuadre
    // limpio de toda la ruta — también mejora la postal capturada.
    cameraRef.current?.setCamera({ pitch: 0, heading: 0, animationDuration: 300 });
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

  // ── Descargar "postal" de la ruta (imagen compartible) ──
  const handleDownloadPostal = useCallback(async () => {
    if (capturing) return;
    // Carga diferida de react-native-view-shot: es un módulo NATIVO; si el
    // binario instalado no lo incluye, importarlo arriba tumbaba toda la
    // pantalla. Aquí degradamos con un mensaje en vez de romper el preview.
    let captureRefFn: ((ref: unknown, opts: unknown) => Promise<string>) | null = null;
    try {
      captureRefFn = require('react-native-view-shot').captureRef;
    } catch {
      captureRefFn = null;
    }
    if (!captureRefFn) {
      showToast('Reinstala la app para descargar la postal (módulo de captura no incluido en este build).', 'error');
      return;
    }
    setCapturing(true);
    const lons = gpsPoints.map((p) => p.longitude);
    const lats = gpsPoints.map((p) => p.latitude);
    const hasBounds = gpsPoints.length >= 2;
    try {
      // 1. Encuadre TIGHT y centrado para la postal (el del fin queda muy lejos
      //    por el padding inferior que deja sitio a la tarjeta). Padding
      //    simétrico y pequeño → la ruta llena el cuadro.
      let mapUri: string | null = null;
      try {
        if (hasBounds && cameraRef.current) {
          cameraRef.current.fitBounds(
            [Math.max(...lons), Math.max(...lats)],
            [Math.min(...lons), Math.min(...lats)],
            [70, 50, 70, 50],
            0,
          );
          await new Promise((r) => setTimeout(r, 900)); // esperar carga de tiles
        }
        mapUri = (await mapRef.current?.takeSnap?.(false)) ?? null;
      } catch { /* sin mapa en la postal */ }
      setPostalMapUri(mapUri);

      // 2. Esperar a que la postal (oculta) renderice con la imagen del mapa.
      await new Promise((r) => setTimeout(r, 400));

      // 3. Permiso de galería.
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) {
        showToast('Permiso de galería denegado.', 'error');
        return;
      }

      // 4. Capturar la postal compuesta (Image + overlays → captura fiable).
      const uri = await captureRefFn(postalRef, { format: 'png', quality: 1 });
      await MediaLibrary.saveToLibraryAsync(uri);

      // 5. Ofrecer compartir.
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Compartir ruta' });
      }
      showToast('Postal guardada en tu galería.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo generar la postal.', 'error');
    } finally {
      // Restaurar el encuadre del fin (deja sitio a la tarjeta de stats).
      if (hasBounds && cameraRef.current) {
        cameraRef.current.fitBounds(
          [Math.max(...lons), Math.max(...lats)],
          [Math.min(...lons), Math.min(...lats)],
          [120, 60, 240, 60],
          500,
        );
      }
      setCapturing(false);
      setPostalMapUri(null);
    }
  }, [capturing, showToast, gpsPoints]);

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

  // ── Perfil de elevación dinámico (HUD cinematográfico) ──
  const elevation = useMemo(() => {
    const raw = gpsPoints.map((p) => p.altitude);
    const hasAlt = raw.some((a) => a != null);
    if (!hasAlt) return { hasAlt: false, bars: [] as number[], min: 0, max: 0, filled: [] as number[] };
    // Carry-forward para tapar huecos de altitud nula.
    let last = raw.find((a) => a != null) as number;
    const filled = raw.map((a) => { if (a != null) last = a; return last; });
    const min = Math.min(...filled);
    const max = Math.max(...filled);
    const N = 40;
    const span = max - min;
    const bars: number[] = [];
    for (let i = 0; i < N; i++) {
      const idx = Math.round((i / (N - 1)) * (filled.length - 1));
      const v = span > 0 ? (filled[idx] - min) / span : 0;
      bars.push(6 + v * 30); // 6..36 px
    }
    return { hasAlt: true, bars, min, max, filled };
  }, [gpsPoints]);

  const currentAlt = elevation.hasAlt
    ? Math.round(elevation.filled[Math.floor(progressIdx)] ?? elevation.filled[0])
    : null;

  // Pulso del cursor (respira). Se recalcula en cada tick durante la reproducción.
  const pulse = (Math.sin(Date.now() / 450) + 1) / 2; // 0..1

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
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        logoEnabled={false}
        attributionEnabled={false}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
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
                circleRadius: 24 + pulse * 14,
                circleColor: '#F59E0B15',
                circleStrokeColor: '#F59E0B25',
                circleStrokeWidth: 1,
                circleOpacity: 1 - pulse * 0.5,
              }}
            />
            <CircleLayer
              id="replay-cursor-halo-inner"
              style={{
                circleRadius: 15 + pulse * 5,
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

      {/* ── Vignette cinematográfico (arriba/abajo) ── */}
      <LinearGradient
        pointerEvents="none"
        colors={['#0D1B12E6', '#0D1B1200']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 170 }}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['#0D1B1200', '#0D1B12F2']}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 280 }}
      />

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
          onDownload={handleDownloadPostal}
          capturing={capturing}
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
          {/* HUD de altitud + mini-perfil de elevación dinámico */}
          {elevation.hasAlt && (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                <View>
                  <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 1.5 }}>
                    ALTITUD
                  </Text>
                  <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700' }}>
                    {currentAlt} m
                  </Text>
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                  máx {Math.round(elevation.max)} m
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 36, gap: 2 }}>
                {elevation.bars.map((h, i) => {
                  const frac = i / (elevation.bars.length - 1);
                  return (
                    <View key={i} style={{
                      flex: 1,
                      height: h,
                      borderRadius: 1,
                      backgroundColor: frac <= progressPct ? colors.accent : '#2D6A4F',
                    }} />
                  );
                })}
              </View>
            </>
          )}

          {/* Scrubber arrastrable (arrastra para mover el replay) */}
          <View
            {...pan.panHandlers}
            onLayout={(e: LayoutChangeEvent) => { barWidthRef.current = e.nativeEvent.layout.width; }}
            style={{ paddingVertical: 8, justifyContent: 'center' }}
          >
            <View style={{ height: 4, backgroundColor: '#FFFFFF20', borderRadius: 2 }}>
              <View style={{
                width: `${progressPct * 100}%`,
                height: '100%',
                backgroundColor: colors.accent,
                borderRadius: 2,
              }} />
            </View>
            <View style={{
              position: 'absolute',
              left: `${progressPct * 100}%`,
              marginLeft: -7,
              width: 14, height: 14, borderRadius: 7,
              backgroundColor: '#fff',
              borderWidth: 2, borderColor: colors.accent,
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

      {/* ── Postal oculta (fuera de pantalla) para capturar y compartir ── */}
      {capturing && (
        <View
          ref={postalRef}
          collapsable={false}
          style={{ position: 'absolute', left: -9999, top: 0, width: SCREEN_W }}
        >
          <RoutePostalContent
            route={route}
            mapUri={postalMapUri}
            bars={elevation.bars}
            waypointsCount={waypoints.length}
            gpsCount={gpsPoints.length}
          />
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────
// Overlays
// ─────────────────────────────────────────────────────────────────

/** Tarjeta "postal" compartible: mapa + stats + perfil de elevación. */
function RoutePostalContent({
  route, mapUri, bars, waypointsCount, gpsCount,
}: {
  route: Route;
  mapUri: string | null;
  bars: number[];
  waypointsCount: number;
  gpsCount: number;
}) {
  const chips = [
    { label: 'Distancia', value: formatDistance(route.distanceMeters) },
    { label: 'Duración', value: formatDuration(route.durationSeconds) },
    { label: 'Subida', value: formatElevation(route.elevationGainMeters) },
    { label: 'Elev. máx.', value: formatElevation(route.maxElevationMeters, false) },
  ];
  return (
    <View style={{ width: SCREEN_W, backgroundColor: colors.bgPrimary }}>
      {/* Mapa */}
      <View style={{ width: SCREEN_W, height: SCREEN_W * 0.66, backgroundColor: '#0D1B12' }}>
        {mapUri ? (
          <Image source={{ uri: mapUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="map-outline" size={48} color="#2D6A4F" />
          </View>
        )}
        <LinearGradient
          colors={['#0D1B1200', '#0D1B12F2']}
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 120 }}
        />
        <View style={{ position: 'absolute', left: 20, bottom: 16, right: 20 }}>
          <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '700', letterSpacing: 2 }}>
            ÑAN KAMAY
          </Text>
          <Text style={{ color: '#fff', fontSize: 24, fontWeight: '800' }} numberOfLines={1}>
            {route.name}
          </Text>
        </View>
      </View>

      {/* Stats */}
      <View style={{ padding: 20, gap: 16 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {chips.map((c) => (
            <View key={c.label} style={{
              width: (SCREEN_W - 40 - 12) / 2,
              backgroundColor: colors.bgCard,
              borderRadius: 12, padding: 14,
              borderWidth: 1, borderColor: colors.border,
            }}>
              <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>{c.value}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{c.label}</Text>
            </View>
          ))}
        </View>

        {/* Perfil de elevación */}
        {bars.length > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 44, gap: 2 }}>
            {bars.map((h, i) => (
              <View key={i} style={{ flex: 1, height: h + 4, borderRadius: 1, backgroundColor: colors.accent }} />
            ))}
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: 16 }}>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>{gpsCount} puntos GPS</Text>
          {waypointsCount > 0 && (
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{waypointsCount} waypoints</Text>
          )}
        </View>
      </View>
    </View>
  );
}

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
            <WaypointPhotoCarousel
              uris={waypoint.imageUris}
              width={SCREEN_W - 32}
              height={SCREEN_W * 0.55}
              animatedStyle={imgStyle}
            />
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
  route, gpsPointsCount, waypointsCount, onRestart, onClose, onDownload, capturing, insetsBottom,
}: {
  route: Route;
  gpsPointsCount: number;
  waypointsCount: number;
  onRestart: () => void;
  onClose: () => void;
  onDownload: () => void;
  capturing: boolean;
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

      {/* Descargar postal compartible */}
      <TouchableOpacity
        onPress={onDownload}
        disabled={capturing}
        style={{
          backgroundColor: colors.bgCard,
          borderRadius: 12,
          paddingVertical: 13,
          alignItems: 'center',
          flexDirection: 'row',
          justifyContent: 'center',
          gap: 8,
          borderWidth: 1, borderColor: colors.accent + '60',
        }}
      >
        {capturing ? (
          <ActivityIndicator size="small" color={colors.accent} />
        ) : (
          <Ionicons name="download-outline" size={18} color={colors.accent} />
        )}
        <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 14 }}>
          {capturing ? 'Generando…' : 'Descargar postal'}
        </Text>
      </TouchableOpacity>

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
