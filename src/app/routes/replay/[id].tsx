import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  Dimensions, StyleSheet, ScrollView, StatusBar, Image, PanResponder, Alert,
  type LayoutChangeEvent,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useAudioPlayer } from 'expo-audio';
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
import { fastDistanceMeters } from '@shared/utils/geometry';
import { formatDistance, formatDuration, formatElevation } from '@shared/utils/formatters';
import { colors } from '@presentation/theme/colors';
import MissingTileKeyBanner from '@presentation/components/map/MissingTileKeyBanner';
import WaypointIcon from '@presentation/components/ui/WaypointIcon';
import { getWaypointTypeInfo } from '@shared/constants/waypointTypes';
import { getReplayMusic, pickReplayMusic, clearReplayMusic } from '@shared/utils/replayMusic';

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

/** Interpola dos colores hex #RRGGBB. */
function lerpHex(a: string, b: string, t: number): string {
  const c = Math.max(0, Math.min(1, t));
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  const ch = pa.map((v, i) => Math.round(v + (pb[i] - v) * c));
  return `#${ch.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Rampa de elevación: verde (bajo) → ámbar → rojo (alto). v en 0..1. */
function elevColorRamp(v: number): string {
  const t = Math.max(0, Math.min(1, v));
  return t < 0.5 ? lerpHex('#22C55E', '#F59E0B', t / 0.5) : lerpHex('#F59E0B', '#EF4444', (t - 0.5) / 0.5);
}

/** Rumbo (grados, 0=N) de a → b. Para alinear la cámara al avance. */
function bearing(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = Math.PI / 180;
  const φ1 = aLat * toRad, φ2 = bLat * toRad;
  const Δλ = (bLon - aLon) * toRad;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

/** Pin de waypoint en el mapa: círculo con el ICONO de su tipo + puntero.
 *  Contenedor de tamaño FIJO: MarkerView (Android) recorta el círculo si el
 *  contenedor no tiene dimensiones medibles (se veía solo el triángulo). */
function WaypointMapPin({ waypoint, active }: { waypoint: Waypoint; active: boolean }) {
  const info = waypoint.type ? getWaypointTypeInfo(waypoint.type) : undefined;
  const iconName = info?.icon ?? 'MapPin';
  const bg = info?.iconColor ?? colors.accent;
  const size = active ? 40 : 30;
  return (
    <View collapsable={false} style={{ width: 60, height: 64, alignItems: 'center', justifyContent: 'flex-end' }}>
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
      {/* Puntero (la base apunta a la coordenada con anchor y:1) */}
      <View
        collapsable={false}
        style={{
          width: 0, height: 0,
          borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 7,
          borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#FFFFFF',
          marginTop: -1,
        }}
      />
    </View>
  );
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

  // ── Música de fondo + ducking (pista elegida por el usuario) ──
  const musicPlayer = useAudioPlayer(undefined);
  const [musicUri, setMusicUri] = useState<string | null>(null);
  const [musicName, setMusicName] = useState<string | null>(null);
  const [musicOn, setMusicOn] = useState(true);

  // Carga la pista guardada al abrir el replay.
  useEffect(() => {
    getReplayMusic().then((p) => {
      if (p) { setMusicUri(p.uri); setMusicName(p.name); }
    });
  }, []);

  // Aplica la fuente de audio cuando cambia la pista elegida.
  useEffect(() => {
    if (!musicUri) return;
    try { musicPlayer.replace(musicUri); musicPlayer.loop = true; } catch { /* noop */ }
  }, [musicUri, musicPlayer]);

  useEffect(() => {
    if (!musicUri) return;
    const active = phase === 'playing' || phase === 'paused' || phase === 'waypoint';
    try { if (musicOn && active) musicPlayer.play(); else musicPlayer.pause(); } catch { /* noop */ }
  }, [phase, musicOn, musicUri, musicPlayer]);

  useEffect(() => {
    if (!musicUri) return;
    // Ducking: baja el volumen mientras suena una nota de voz en un waypoint.
    const ducking = phase === 'waypoint' && (activeWaypoint?.audios.length ?? 0) > 0;
    try { musicPlayer.volume = ducking ? 0.1 : 0.5; } catch { /* noop */ }
  }, [phase, activeWaypoint, musicUri, musicPlayer]);

  // Elige una pista nueva del dispositivo y la activa.
  const chooseMusic = useCallback(async () => {
    try {
      const p = await pickReplayMusic();
      if (p) { setMusicUri(p.uri); setMusicName(p.name); setMusicOn(true); showToast(`Música: ${p.name}`, 'success'); }
    } catch {
      showToast('No se pudo cargar la música.', 'error');
    }
  }, [showToast]);

  // Botón de música: sin pista → elegir; con pista → activar/silenciar.
  const handleMusicPress = useCallback(() => {
    if (!musicUri) { chooseMusic(); return; }
    setMusicOn((v) => !v);
  }, [musicUri, chooseMusic]);

  // Mantener pulsado (con pista) → cambiar o quitar.
  const handleMusicLongPress = useCallback(() => {
    if (!musicUri) return;
    Alert.alert(musicName ?? 'Música de fondo', undefined, [
      { text: 'Cambiar pista', onPress: () => { chooseMusic(); } },
      {
        text: 'Quitar música',
        style: 'destructive',
        onPress: async () => {
          try { musicPlayer.pause(); } catch { /* noop */ }
          await clearReplayMusic();
          setMusicUri(null); setMusicName(null);
        },
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }, [musicUri, musicName, musicPlayer, chooseMusic]);

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

  // Capítulos: posición (fracción 0..1) de cada waypoint en el track, para
  // marcarlos en la línea de tiempo y poder saltar a ellos.
  const chapters = useMemo(() => {
    const N = gpsPoints.length - 1;
    if (N < 1) return [] as { id: string; frac: number }[];
    return waypoints.map((wp) => {
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < gpsPoints.length; i++) {
        const d = fastDistanceMeters(gpsPoints[i].latitude, gpsPoints[i].longitude, wp.latitude, wp.longitude);
        if (d < bestD) { bestD = d; best = i; }
      }
      return { id: wp.id, frac: best / N };
    });
  }, [gpsPoints, waypoints]);

  // Degradado de la traza por elevación (verde→ámbar→rojo). Requiere lineMetrics.
  const lineGradient = useMemo(() => {
    if (!elevation.hasAlt || elevation.filled.length < 2) return null;
    const { filled, min, max } = elevation;
    const span = max - min || 1;
    const N = 16;
    const stops: (number | string)[] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const idx = Math.round(t * (filled.length - 1));
      stops.push(t, elevColorRamp((filled[idx] - min) / span));
    }
    return ['interpolate', ['linear'], ['line-progress'], ...stops];
  }, [elevation]);

  const traveledGeoJson: GeoJSON.Feature<GeoJSON.LineString> | null =
    traveledCoords.length > 1
      ? { type: 'Feature', geometry: { type: 'LineString', coordinates: traveledCoords }, properties: {} }
      : null;

  const fullGeoJson: GeoJSON.Feature<GeoJSON.LineString> | null =
    fullCoords.length > 1
      ? { type: 'Feature', geometry: { type: 'LineString', coordinates: fullCoords }, properties: {} }
      : null;

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
        compassEnabled
        compassViewPosition={0}
        compassViewMargins={{ x: 16, y: 132 }}
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

        {/* Traza completa: coloreada por ELEVACIÓN (verde→ámbar→rojo) si hay
            altitud; si no, gris tenue. El tramo recorrido (ámbar) va encima. */}
        {fullGeoJson && (
          <ShapeSource id="replay-full" shape={fullGeoJson} lineMetrics={!!lineGradient}>
            <LineLayer
              id="replay-full-line"
              style={
                lineGradient
                  ? { lineGradient: lineGradient as any, lineWidth: 5, lineCap: 'round', lineJoin: 'round' }
                  : { lineColor: '#FFFFFF', lineOpacity: 0.25, lineWidth: 4, lineCap: 'round', lineJoin: 'round' }
              }
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

        {/* Waypoints: pin con el ICONO de su tipo (se agranda + glow en su escena) */}
        {waypoints.map((wp) => (
          <MarkerView
            key={wp.id}
            coordinate={[wp.longitude, wp.latitude]}
            anchor={{ x: 0.5, y: 1 }}
            allowOverlap
          >
            <WaypointMapPin waypoint={wp} active={activeWaypoint?.id === wp.id} />
          </MarkerView>
        ))}
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
        <TouchableOpacity
          onPress={handleMusicPress}
          onLongPress={handleMusicLongPress}
          style={{
            width: 40, height: 40, borderRadius: 20,
            backgroundColor: '#0D1B12CC',
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 1, borderColor: '#2D6A4F80',
          }}
        >
          <Ionicons
            name={musicUri && musicOn ? 'musical-notes' : 'musical-notes-outline'}
            size={20}
            color={musicUri && musicOn ? colors.accent : colors.textMuted}
          />
        </TouchableOpacity>
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
          insetsTop={insets.top}
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

          {/* Capítulos: banderas de waypoint sobre la línea de tiempo (tap para saltar) */}
          {chapters.length > 0 && (
            <View style={{ height: 14, marginBottom: -6 }}>
              {chapters.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => { setPhase('paused'); seekTo(c.frac); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ position: 'absolute', left: `${c.frac * 100}%`, marginLeft: -6 }}
                >
                  <Ionicons name="flag" size={12} color={colors.accent} />
                </TouchableOpacity>
              ))}
            </View>
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

const AnimatedImage = Animated.createAnimatedComponent(Image);

/** Forma de onda estática (decorativa) para la píldora de nota de voz. */
const WAVE_BARS = [10, 18, 26, 14, 30, 20, 12, 24, 16, 28, 12, 20];

function WaypointOverlay({
  waypoint, index, total, onContinue, insetsTop, insetsBottom,
}: {
  waypoint: Waypoint;
  index: number;
  total: number;
  onContinue: () => void;
  insetsTop: number;
  insetsBottom: number;
}) {
  // Media de la escena: hero = video (si hay) o fotos (slideshow); narración = nota de voz.
  const heroVideo = waypoint.videos[0];
  const narration = waypoint.audios[0];
  const photos = waypoint.imageUris;
  const videos = waypoint.videos;
  const audios = waypoint.audios;

  // La tira de multimedia se muestra solo si hay más de un elemento (si no, basta el hero).
  const mediaCount = photos.length + videos.length + audios.length;
  const showStrip = mediaCount > 1;

  const HERO_W = SCREEN_W - 32;
  const HERO_H = Math.round(SCREEN_W * 0.56);

  // Datos enriquecidos: tipo (con su icono), altitud y coordenadas.
  const typeInfo = waypoint.type ? getWaypointTypeInfo(waypoint.type) : undefined;
  const typeLabel = (waypoint.type ?? 'Waypoint').toUpperCase();
  const typeIconName = typeInfo?.icon ?? 'MapPin';
  const typeColor = typeInfo?.iconColor ?? colors.accent;
  const coords = `${waypoint.latitude.toFixed(5)}, ${waypoint.longitude.toFixed(5)}`;

  // Duración de la escena: alcanza para ver el video / oír la voz / pasar fotos.
  const sceneMs = Math.min(
    60000,
    Math.max(7000, heroVideo?.durationMs ?? 0, narration?.durationMs ?? 0, photos.length * 4200),
  );

  // Players (hooks siempre llamados; source nulo si no hay media).
  const videoPlayer = useVideoPlayer(heroVideo ? heroVideo.uri : null, (p) => {
    p.loop = false;
    p.muted = !!narration; // si hay nota de voz, el video va mudo para oír la narración
  });
  const audioPlayer = useAudioPlayer(narration ? narration.uri : undefined);

  // Animaciones (storyboard A→D: la imagen "crece" a su tamaño, luego entran
  // la tira de media y los datos, dentro de los ~7s de escena).
  const vignetteOpacity = useSharedValue(0);
  const heroScale = useSharedValue(0.4);   // hero crece desde el centro (nace del punto)
  const heroOpacity = useSharedValue(0);
  const stripOpacity = useSharedValue(0);
  const stripY = useSharedValue(20);
  const dataOpacity = useSharedValue(0);
  const dataY = useSharedValue(24);
  const progress = useSharedValue(0);     // progreso de escena (auto-avance)
  const imgScale = useSharedValue(1);     // Ken Burns (interno al hero)
  const imgOpacity = useSharedValue(1);   // crossfade entre fotos

  const [slideIdx, setSlideIdx] = useState(0);
  const finishedRef = useRef(false);

  const handleContinue = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    try { videoPlayer.pause(); } catch { /* noop */ }
    try { audioPlayer.pause(); } catch { /* noop */ }
    vignetteOpacity.value = withTiming(0, { duration: 300 });
    stripOpacity.value = withTiming(0, { duration: 220 });
    dataOpacity.value = withTiming(0, { duration: 220 });
    heroOpacity.value = withTiming(0, { duration: 280 }, (finished) => {
      if (finished) runOnJS(onContinue)();
    });
    heroScale.value = withTiming(0.85, { duration: 280 });
  }, [onContinue, videoPlayer, audioPlayer]);

  useEffect(() => {
    finishedRef.current = false;
    vignetteOpacity.value = 0;
    heroScale.value = 0.4; heroOpacity.value = 0;
    stripOpacity.value = 0; stripY.value = 20;
    dataOpacity.value = 0; dataY.value = 24;
    progress.value = 0; imgScale.value = 1; imgOpacity.value = 1;
    setSlideIdx(0);

    // Viñeta de legibilidad (deja ver el mapa detrás, no un fondo negro sólido).
    vignetteOpacity.value = withTiming(1, { duration: 600 });

    // 0–1.8s: el hero nace y crece a su tamaño definido.
    heroOpacity.value = withTiming(1, { duration: 450 });
    heroScale.value = withSpring(1, { damping: 13, stiffness: 72 });

    // ~1.6s: entra la tira de multimedia.
    stripOpacity.value = withDelay(1600, withTiming(1, { duration: 450 }));
    stripY.value = withDelay(1600, withSpring(0, { damping: 16, stiffness: 150 }));

    // ~2.2s: entran los datos (sobre la viñeta, sin tarjeta).
    dataOpacity.value = withDelay(2200, withTiming(1, { duration: 550 }));
    dataY.value = withDelay(2200, withSpring(0, { damping: 18, stiffness: 150 }));

    // Ken Burns durante toda la escena.
    imgScale.value = withTiming(1.18, { duration: sceneMs, easing: Easing.linear });

    // Reproducir media (video + narración).
    if (heroVideo) { try { videoPlayer.play(); } catch { /* noop */ } }
    if (narration) { try { audioPlayer.play(); } catch { /* noop */ } }

    // Progreso de escena → auto-continuar al terminar (como una película).
    progress.value = withTiming(1, { duration: sceneMs, easing: Easing.linear }, (fin) => {
      if (fin) runOnJS(handleContinue)();
    });
  }, [waypoint.id]);

  // Slideshow de fotos (solo si no hay video y hay >1 foto).
  useEffect(() => {
    if (heroVideo || photos.length <= 1) return;
    const each = sceneMs / photos.length;
    const t = setInterval(() => setSlideIdx((i) => (i + 1) % photos.length), each);
    return () => clearInterval(t);
  }, [heroVideo, photos.length, sceneMs]);

  // Crossfade al cambiar de foto.
  useEffect(() => {
    if (heroVideo) return;
    imgOpacity.value = 0;
    imgOpacity.value = withTiming(1, { duration: 600 });
  }, [slideIdx, heroVideo]);

  const vignetteStyle = useAnimatedStyle(() => ({ opacity: vignetteOpacity.value }));
  const heroCardStyle = useAnimatedStyle(() => ({
    opacity: heroOpacity.value,
    transform: [{ scale: heroScale.value }],
  }));
  const heroImgStyle = useAnimatedStyle(() => ({
    opacity: imgOpacity.value,
    transform: [{ scale: imgScale.value }],
  }));
  const stripStyle = useAnimatedStyle(() => ({
    opacity: stripOpacity.value,
    transform: [{ translateY: stripY.value }],
  }));
  const dataStyle = useAnimatedStyle(() => ({
    opacity: dataOpacity.value,
    transform: [{ translateY: dataY.value }],
  }));
  const progressStyle = useAnimatedStyle(() => ({ width: progress.value * HERO_W }));

  const fmtDur = (ms?: number) => {
    const s = Math.round((ms ?? 0) / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  return (
    <>
      {/* Viñeta inferior: deja ver el mapa detrás y da legibilidad a los datos
          transparentes (en vez de un fondo negro sólido). */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFillObject, vignetteStyle]}>
        <LinearGradient
          colors={['#0D1B1200', '#0D1B12D9', '#0D1B12F2']}
          locations={[0, 0.55, 1]}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: SCREEN_W * 1.5 }}
        />
      </Animated.View>

      {/* Bloque de contenido centrado verticalmente: el hero nace del waypoint
          (centro de pantalla) y crece, luego entran tira y datos debajo. */}
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: insetsTop,
          left: 16, right: 16,
          bottom: insetsBottom,
          justifyContent: 'center',
        }}
      >
        {/* ── Hero media (crece a su tamaño) ── */}
        <Animated.View
          style={[
            {
              width: HERO_W,
              height: HERO_H,
              borderRadius: 20,
              overflow: 'hidden',
              backgroundColor: '#000',
              borderWidth: 3,
              borderColor: '#FFFFFF',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 16 },
              shadowOpacity: 0.7,
              shadowRadius: 24,
              elevation: 12,
            },
            heroCardStyle,
          ]}
        >
          {heroVideo ? (
            <VideoView
              player={videoPlayer}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              nativeControls={false}
            />
          ) : photos.length > 0 ? (
            <AnimatedImage
              source={{ uri: photos[slideIdx] }}
              style={[{ width: '100%', height: '100%' }, heroImgStyle]}
              resizeMode="cover"
            />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgCard }}>
              <WaypointIcon name={typeIconName} size={48} color={typeColor} />
            </View>
          )}

          {/* Barra de progreso de la escena (auto-avance) */}
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: '#FFFFFF22' }}>
            <Animated.View style={[{ height: 3, backgroundColor: colors.accent }, progressStyle]} />
          </View>

          {/* Indicador de narración (nota de voz sonando) */}
          {narration ? (
            <View style={{
              position: 'absolute', top: 12, left: 12,
              flexDirection: 'row', alignItems: 'center', gap: 6,
              backgroundColor: '#0D1B12CC', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5,
            }}>
              <Ionicons name="mic" size={13} color={colors.accent} />
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}>Narrando…</Text>
            </View>
          ) : null}

          {/* Dots del slideshow */}
          {!heroVideo && photos.length > 1 && (
            <View style={{ position: 'absolute', bottom: 10, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 5 }}>
              {photos.map((_, i) => (
                <View key={i} style={{ width: i === slideIdx ? 16 : 5, height: 5, borderRadius: 3, backgroundColor: i === slideIdx ? colors.accent : '#FFFFFF66' }} />
              ))}
            </View>
          )}
        </Animated.View>

        {/* ── Tira de multimedia: fotos · video · notas de voz ── */}
        {showStrip && (
          <Animated.View style={[{ marginTop: 14 }, stripStyle]}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, alignItems: 'center' }}
            >
              {photos.map((uri, i) => (
                <Image
                  key={`p${i}`}
                  source={{ uri }}
                  style={{ width: 60, height: 60, borderRadius: 12, borderWidth: 1, borderColor: '#FFFFFF40' }}
                />
              ))}
              {videos.map((v, i) => (
                <View key={`v${i}`} style={{ width: 60, height: 60, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#FFFFFF40', backgroundColor: '#000' }}>
                  {v.thumbnailUri ? (
                    <Image source={{ uri: v.thumbnailUri }} style={{ width: '100%', height: '100%' }} />
                  ) : null}
                  <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0D1B1259' }}>
                    <Ionicons name="play" size={18} color="#fff" />
                  </View>
                  <View style={{ position: 'absolute', bottom: 4, right: 4, backgroundColor: '#0D1B12CC', borderRadius: 5, paddingHorizontal: 4, paddingVertical: 1 }}>
                    <Text style={{ color: '#fff', fontSize: 9 }}>{fmtDur(v.durationMs)}</Text>
                  </View>
                </View>
              ))}
              {audios.map((a, i) => (
                <View
                  key={`a${i}`}
                  style={{
                    height: 60, flexDirection: 'row', alignItems: 'center', gap: 8,
                    paddingHorizontal: 12, borderRadius: 12,
                    backgroundColor: colors.bgCard, borderWidth: 1, borderColor: '#F59E0B55',
                  }}
                >
                  <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="mic" size={16} color="#0D1B12" />
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 34 }}>
                    {WAVE_BARS.map((h, j) => (
                      <View key={j} style={{ width: 3, height: h, borderRadius: 2, backgroundColor: colors.accent }} />
                    ))}
                  </View>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600' }}>{fmtDur(a.durationMs)}</Text>
                </View>
              ))}
            </ScrollView>
          </Animated.View>
        )}

        {/* ── Datos (transparente, sobre la viñeta) ── */}
        <Animated.View style={[{ marginTop: 16, gap: 10 }, dataStyle]}>
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

          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700' }}>
            {waypoint.title}
          </Text>

          {/* Meta: altitud + coordenadas (iconos en ámbar) */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
            {waypoint.altitude != null && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Ionicons name="trending-up-outline" size={14} color={colors.accent} />
                <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>
                  {Math.round(waypoint.altitude)} m
                </Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons name="location-outline" size={14} color={colors.accent} />
              <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>{coords}</Text>
            </View>
          </View>

          {waypoint.description ? (
            <ScrollView style={{ maxHeight: 84 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>
                {waypoint.description}
              </Text>
            </ScrollView>
          ) : null}

          <TouchableOpacity
            onPress={handleContinue}
            style={{
              backgroundColor: colors.accent,
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: 'center',
              marginTop: 4,
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
        </Animated.View>
      </View>
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
