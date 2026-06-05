import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import {
  MapView, Camera, RasterSource, RasterLayer, ShapeSource, LineLayer, CircleLayer,
  setAccessToken, Logger,
} from '@maplibre/maplibre-react-native';
import { thunderforestTileUrls } from '@infrastructure/config/env';
import { fastDistanceMeters } from '@shared/utils/geometry';
import { formatDistance, formatDuration } from '@shared/utils/formatters';
import { setPlannedGuide } from '@shared/utils/plannedRoute';
import { useUiStore } from '@presentation/stores/uiStore';
import MissingTileKeyBanner from '@presentation/components/map/MissingTileKeyBanner';
import { colors } from '@presentation/theme/colors';

if (typeof setAccessToken === 'function') setAccessToken(null);
Logger.setLogCallback((log) => {
  if (log.message?.includes('Failed to load tile')) return true;
  if (log.message?.includes('permanent error: Canceled')) return true;
  return false;
});

/** Velocidad media de marcha para estimar duración (m/s ≈ 4 km/h). */
const HIKING_MPS = 4000 / 3600;

export default function RoutePlannerScreen() {
  const insets = useSafeAreaInsets();
  const { showToast } = useUiStore();
  const cameraRef = useRef<any>(null);
  const [points, setPoints] = useState<[number, number][]>([]); // [lon, lat]
  const [zoom, setZoom] = useState(13);

  useEffect(() => {
    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getLastKnownPositionAsync();
      if (loc && cameraRef.current) {
        cameraRef.current.setCamera({ centerCoordinate: [loc.coords.longitude, loc.coords.latitude], zoomLevel: 14, animationDuration: 0 });
      }
    })().catch(() => {});
  }, []);

  // Tocar el mapa: si el toque cae cerca de un punto existente lo quita; si no,
  // añade un punto nuevo. (Umbral en metros equivalente a ~22 px del zoom actual.)
  const onMapPress = (e: any) => {
    const c = e?.geometry?.coordinates;
    if (!Array.isArray(c) || c.length < 2) return;
    const mpp = (156543.03392 * Math.cos((c[1] * Math.PI) / 180)) / Math.pow(2, zoom);
    let hit = -1;
    let best = mpp * 22;
    for (let i = 0; i < points.length; i++) {
      const d = fastDistanceMeters(points[i][1], points[i][0], c[1], c[0]);
      if (d < best) { best = d; hit = i; }
    }
    if (hit >= 0) setPoints((p) => p.filter((_, idx) => idx !== hit));
    else setPoints((p) => [...p, [c[0], c[1]]]);
  };
  const undo = () => setPoints((p) => p.slice(0, -1));
  const clear = () => setPoints([]);

  const distanceMeters = useMemo(() => {
    let d = 0;
    for (let i = 1; i < points.length; i++) {
      d += fastDistanceMeters(points[i - 1][1], points[i - 1][0], points[i][1], points[i][0]);
    }
    return d;
  }, [points]);

  const lineGeoJson = useMemo<GeoJSON.Feature<GeoJSON.LineString> | null>(
    () => (points.length > 1 ? { type: 'Feature', geometry: { type: 'LineString', coordinates: points }, properties: {} } : null),
    [points],
  );

  const dotsGeoJson = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(
    () => ({
      type: 'FeatureCollection',
      features: points.map((c, i) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: c },
        properties: { role: i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'mid' },
      })),
    }),
    [points],
  );

  const handleFollow = () => {
    if (points.length < 2) { showToast('Añade al menos 2 puntos.', 'info'); return; }
    setPlannedGuide({
      parentRouteId: '',
      parentName: 'Ruta planificada',
      guidePoints: points.map(([lon, lat]) => ({ latitude: lat, longitude: lon })),
      guideWaypoints: [],
    });
    router.push('/tracking/pre-recording?planned=1');
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <MapView
        style={{ flex: 1 }}
        logoEnabled={false}
        attributionEnabled={false}
        onPress={onMapPress}
        onRegionDidChange={(f: any) => {
          const z = f?.properties?.zoomLevel;
          if (typeof z === 'number') setZoom(z);
        }}
      >
        <RasterSource id="plan-tiles" tileUrlTemplates={thunderforestTileUrls('outdoors')} tileSize={256} maxZoomLevel={18} minZoomLevel={1}>
          <RasterLayer id="plan-tile-layer" sourceID="plan-tiles" style={{ rasterOpacity: 1 }} />
        </RasterSource>
        <Camera ref={cameraRef} defaultSettings={{ centerCoordinate: [-75.0152, -9.19], zoomLevel: 13 }} />

        {lineGeoJson && (
          <ShapeSource id="plan-line" shape={lineGeoJson}>
            <LineLayer id="plan-line-layer" style={{ lineColor: colors.accent, lineWidth: 4, lineCap: 'round', lineJoin: 'round' }} />
          </ShapeSource>
        )}

        {/* Puntos como capa nativa (exactos, cuadran con la línea) */}
        {points.length > 0 && (
          <ShapeSource id="plan-dots" shape={dotsGeoJson}>
            <CircleLayer
              id="plan-dots-layer"
              style={{
                circleRadius: 6,
                circleColor: ['match', ['get', 'role'], 'start', colors.success, 'end', '#EF4444', colors.accent] as any,
                circleStrokeColor: '#FFFFFF',
                circleStrokeWidth: 2,
              }}
            />
          </ShapeSource>
        )}
      </MapView>

      <MissingTileKeyBanner />

      {/* Header */}
      <View style={{ position: 'absolute', top: insets.top + 12, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()} style={circleBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, backgroundColor: '#0D1B12CC', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#2D6A4F80' }}>
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>Planificar ruta</Text>
          <Text style={{ color: colors.textMuted, fontSize: 11 }}>Toca el mapa para añadir puntos · toca un punto para quitarlo</Text>
        </View>
        <TouchableOpacity onPress={undo} disabled={points.length === 0} style={[circleBtn, { opacity: points.length === 0 ? 0.5 : 1 }]}>
          <Ionicons name="arrow-undo" size={20} color={colors.accent} />
        </TouchableOpacity>
      </View>

      {/* Panel inferior */}
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.bgPrimary, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 16, paddingBottom: insets.bottom + 16, gap: 14 }}>
        <View style={{ flexDirection: 'row' }}>
          {[
            { v: formatDistance(distanceMeters), l: 'Distancia' },
            { v: points.length >= 2 ? formatDuration(Math.round(distanceMeters / HIKING_MPS)) : '—', l: 'Estimado (4 km/h)' },
            { v: String(points.length), l: 'Puntos' },
          ].map((s) => (
            <View key={s.l} style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '800' }}>{s.v}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>{s.l}</Text>
            </View>
          ))}
        </View>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity onPress={clear} disabled={points.length === 0}
            style={{ flex: 1, height: 50, borderRadius: 14, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: points.length === 0 ? 0.5 : 1 }}>
            <Ionicons name="trash-outline" size={18} color={colors.textSecondary} />
            <Text style={{ color: colors.textSecondary, fontSize: 15, fontWeight: '700' }}>Limpiar</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleFollow} disabled={points.length < 2}
            style={{ flex: 1.4, height: 50, borderRadius: 14, backgroundColor: points.length >= 2 ? colors.accent : colors.bgCard, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Ionicons name="navigate" size={18} color={points.length >= 2 ? '#0D1B12' : colors.textMuted} />
            <Text style={{ color: points.length >= 2 ? '#0D1B12' : colors.textMuted, fontSize: 15, fontWeight: '700' }}>Seguir ruta</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const circleBtn = {
  width: 40, height: 40, borderRadius: 20, backgroundColor: '#0D1B12CC',
  alignItems: 'center' as const, justifyContent: 'center' as const,
  borderWidth: 1, borderColor: '#2D6A4F80',
};
