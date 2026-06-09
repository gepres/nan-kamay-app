import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StatusBar, Modal, TextInput, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import {
  MapView, Camera, ShapeSource, LineLayer, CircleLayer,
  setAccessToken, Logger,
} from '@maplibre/maplibre-react-native';
import { fastDistanceMeters, nearestSegmentOnPath } from '@shared/utils/geometry';
import { formatDistance, formatDuration } from '@shared/utils/formatters';
import { setPlannedGuide } from '@shared/utils/plannedRoute';
import { Route } from '@core/entities/Route';
import { routeRepository } from '@infrastructure/repositories/RouteRepositoryImpl';
import { useAuthStore } from '@presentation/stores/authStore';
import { useUiStore } from '@presentation/stores/uiStore';
import MissingTileKeyBanner from '@presentation/components/map/MissingTileKeyBanner';
import { Basemap } from '@presentation/components/map/Basemap';
import { useBasemap } from '@presentation/hooks/useBasemap';
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
  const user = useAuthStore((s) => s.user);
  const { edit } = useLocalSearchParams<{ edit?: string }>();

  const mapRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const [points, setPoints] = useState<[number, number][]>([]); // [lon, lat]
  const [zoom, setZoom] = useState(13);
  const [selected, setSelected] = useState<number | null>(null);

  // Edición de una ruta planificada guardada (?edit=<id>).
  const [editId, setEditId] = useState<string | undefined>(edit);
  const editCreatedAt = useRef<Date | null>(null);

  const [saving, setSaving] = useState(false);
  const [nameModal, setNameModal] = useState(false);
  const [nameDraft, setNameDraft] = useState('Ruta planificada');

  // Base del mapa: raster online o vector local (PMTiles) sin señal.
  const { mapStyleJSON, isOfflineVector } = useBasemap(
    points[0] ? { lng: points[0][0], lat: points[0][1] } : null,
  );

  // Centrar en la ubicación al abrir (si no estamos editando).
  useEffect(() => {
    if (edit) return;
    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getLastKnownPositionAsync();
      if (loc && cameraRef.current) {
        cameraRef.current.setCamera({ centerCoordinate: [loc.coords.longitude, loc.coords.latitude], zoomLevel: 14, animationDuration: 0 });
      }
    })().catch(() => {});
  }, [edit]);

  // Cargar una ruta planificada existente para seguir editándola.
  useEffect(() => {
    if (!edit) return;
    (async () => {
      const [route, pts] = await Promise.all([
        routeRepository.getById(edit),
        routeRepository.getGpsPoints(edit),
      ]);
      if (route) { setNameDraft(route.name); editCreatedAt.current = route.createdAt; }
      const coords = pts.map((p) => [p.longitude, p.latitude] as [number, number]);
      setPoints(coords);
      if (coords.length && cameraRef.current) {
        cameraRef.current.setCamera({ centerCoordinate: coords[Math.floor(coords.length / 2)], zoomLevel: 14, animationDuration: 0 });
      }
    })().catch(() => {});
  }, [edit]);

  const metersPerPixel = (lat: number) => (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);

  // Tocar el mapa: 1) si cae sobre un punto → lo selecciona; 2) si cae sobre un
  // tramo → inserta un punto ahí; 3) si no → añade un punto al final.
  const onMapPress = (e: any) => {
    const c = e?.geometry?.coordinates;
    if (!Array.isArray(c) || c.length < 2) return;
    const mpp = metersPerPixel(c[1]);

    // 1) ¿toque sobre un punto existente? → seleccionar
    let hit = -1;
    let best = mpp * 22;
    for (let i = 0; i < points.length; i++) {
      const d = fastDistanceMeters(points[i][1], points[i][0], c[1], c[0]);
      if (d < best) { best = d; hit = i; }
    }
    if (hit >= 0) { setSelected((s) => (s === hit ? null : hit)); return; }

    // 2) ¿toque sobre un tramo? → insertar punto intermedio
    if (points.length >= 2) {
      const seg = nearestSegmentOnPath(c[0], c[1], points);
      if (seg && seg.distanceMeters < mpp * 14) {
        setPoints((p) => {
          const next = p.slice();
          next.splice(seg.index + 1, 0, [c[0], c[1]]);
          return next;
        });
        setSelected(seg.index + 1);
        return;
      }
    }

    // 3) añadir al final
    setPoints((p) => [...p, [c[0], c[1]]]);
    setSelected(null);
  };

  const addAtCenter = async () => {
    try {
      const c = await mapRef.current?.getCenter?.(); // [lon, lat]
      if (Array.isArray(c) && c.length >= 2) {
        setPoints((p) => [...p, [c[0], c[1]]]);
        setSelected(null);
      }
    } catch { /* noop */ }
  };

  const moveSelectedToCenter = async () => {
    if (selected == null) return;
    try {
      const c = await mapRef.current?.getCenter?.();
      if (Array.isArray(c) && c.length >= 2) {
        setPoints((p) => p.map((pt, i) => (i === selected ? [c[0], c[1]] : pt)));
      }
    } catch { /* noop */ }
  };

  const deleteSelected = () => {
    if (selected == null) return;
    setPoints((p) => p.filter((_, i) => i !== selected));
    setSelected(null);
  };

  const undo = () => { setPoints((p) => p.slice(0, -1)); setSelected(null); };
  const clear = () => { setPoints([]); setSelected(null); };

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
        properties: {
          role: i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'mid',
          selected: i === selected,
        },
      })),
    }),
    [points, selected],
  );

  const buildRoute = (name: string): Route => {
    const userId = user?.id ?? '';
    const props = {
      userId,
      name: name.trim() || 'Ruta planificada',
      description: undefined,
      activityType: undefined,
      difficulty: 'easy' as const,
      distanceMeters,
      durationSeconds: Math.round(distanceMeters / HIKING_MPS),
      elevationGainMeters: 0,
      elevationLossMeters: 0,
      maxElevationMeters: 0,
      minElevationMeters: 0,
      avgSpeedKmh: 0,
      maxSpeedKmh: 0,
      startedAt: editCreatedAt.current ?? new Date(),
      finishedAt: editCreatedAt.current ?? new Date(),
      isPublic: false,
      isDraft: false,
      isPlanned: true,
    };
    // Edición: conservar id y created_at. Nueva: id/createdAt generados.
    return editId
      ? Route.fromProps({ ...props, id: editId, isSynced: false, createdAt: editCreatedAt.current ?? new Date() })
      : Route.create(props);
  };

  const handleSave = async () => {
    if (points.length < 2) { showToast('Añade al menos 2 puntos.', 'info'); return; }
    if (!user) { showToast('Inicia sesión para guardar.', 'error'); return; }
    setSaving(true);
    try {
      const route = buildRoute(nameDraft);
      await routeRepository.savePlannedRoute(route, points.map(([lon, lat]) => ({ latitude: lat, longitude: lon })));
      setEditId(route.id);
      editCreatedAt.current = route.createdAt;
      setNameModal(false);
      showToast('Ruta planificada guardada.', 'success');
    } catch {
      showToast('No se pudo guardar la ruta.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleFollow = () => {
    if (points.length < 2) { showToast('Añade al menos 2 puntos.', 'info'); return; }
    setPlannedGuide({
      parentRouteId: editId ?? '',
      parentName: nameDraft.trim() || 'Ruta planificada',
      guidePoints: points.map(([lon, lat]) => ({ latitude: lat, longitude: lon })),
      guideWaypoints: [],
    });
    router.push('/tracking/pre-recording?planned=1');
  };

  const hasSelection = selected != null;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        mapStyle={mapStyleJSON}
        logoEnabled={false}
        attributionEnabled={false}
        onPress={onMapPress}
        onRegionDidChange={(f: any) => {
          const z = f?.properties?.zoomLevel;
          if (typeof z === 'number') setZoom(z);
        }}
      >
        <Basemap offlineVector={isOfflineVector} />
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
                circleRadius: ['case', ['get', 'selected'], 9, 6] as any,
                circleColor: ['match', ['get', 'role'], 'start', colors.success, 'end', '#EF4444', colors.accent] as any,
                circleStrokeColor: ['case', ['get', 'selected'], '#FFFFFF', '#FFFFFF'] as any,
                circleStrokeWidth: ['case', ['get', 'selected'], 3, 2] as any,
              }}
            />
          </ShapeSource>
        )}
      </MapView>

      <MissingTileKeyBanner />

      {/* Crosshair central (referencia para "Añadir punto" / "Mover aquí") */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: '#FFFFFFDD', alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent }} />
        </View>
      </View>

      {/* Header */}
      <View style={{ position: 'absolute', top: insets.top + 12, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()} style={circleBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, backgroundColor: '#0D1B12CC', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#2D6A4F80' }}>
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }} numberOfLines={1}>
            {editId ? nameDraft : 'Planificar ruta'}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 11 }}>Toca para añadir · toca un punto para elegirlo · toca la línea para insertar</Text>
        </View>
        <TouchableOpacity onPress={undo} disabled={points.length === 0} style={[circleBtn, { opacity: points.length === 0 ? 0.5 : 1 }]}>
          <Ionicons name="arrow-undo" size={20} color={colors.accent} />
        </TouchableOpacity>
      </View>

      {/* Botón "Añadir punto" (centro), encima del panel */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', marginBottom: panelHeight(hasSelection) + insets.bottom + 16 }}>
        <TouchableOpacity onPress={addAtCenter}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.accent, paddingHorizontal: 18, height: 44, borderRadius: 22, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 6, elevation: 4 }}>
          <Ionicons name="add" size={20} color="#0D1B12" />
          <Text style={{ color: '#0D1B12', fontSize: 14, fontWeight: '700' }}>Añadir punto aquí</Text>
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

        {/* Acciones del punto seleccionado */}
        {hasSelection && (
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity onPress={moveSelectedToCenter}
              style={{ flex: 1, height: 46, borderRadius: 12, backgroundColor: colors.bgElevated, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Ionicons name="move" size={18} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>Mover aquí</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={deleteSelected}
              style={{ flex: 1, height: 46, borderRadius: 12, backgroundColor: colors.danger + '22', borderWidth: 1, borderColor: colors.danger, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
              <Text style={{ color: colors.danger, fontSize: 14, fontWeight: '700' }}>Quitar punto</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Acciones principales */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity onPress={clear} disabled={points.length === 0}
            style={{ width: 50, height: 50, borderRadius: 14, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', opacity: points.length === 0 ? 0.5 : 1 }}>
            <Ionicons name="trash-outline" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setNameModal(true)} disabled={points.length < 2}
            style={{ flex: 1, height: 50, borderRadius: 14, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: points.length < 2 ? 0.5 : 1 }}>
            <Ionicons name="save-outline" size={18} color={colors.textSecondary} />
            <Text style={{ color: colors.textSecondary, fontSize: 15, fontWeight: '700' }}>Guardar</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleFollow} disabled={points.length < 2}
            style={{ flex: 1.2, height: 50, borderRadius: 14, backgroundColor: points.length >= 2 ? colors.accent : colors.bgCard, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Ionicons name="navigate" size={18} color={points.length >= 2 ? '#0D1B12' : colors.textMuted} />
            <Text style={{ color: points.length >= 2 ? '#0D1B12' : colors.textMuted, fontSize: 15, fontWeight: '700' }}>Seguir</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Modal de nombre para guardar */}
      <Modal visible={nameModal} transparent animationType="fade" onRequestClose={() => setNameModal(false)}>
        <View style={{ flex: 1, backgroundColor: '#000A', justifyContent: 'center', paddingHorizontal: 28 }}>
          <View style={{ backgroundColor: colors.bgPrimary, borderRadius: 18, padding: 20, gap: 16, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '800' }}>Guardar ruta planificada</Text>
            <TextInput
              value={nameDraft}
              onChangeText={setNameDraft}
              placeholder="Nombre de la ruta"
              placeholderTextColor={colors.textMuted}
              style={{ backgroundColor: colors.bgInput, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: colors.textPrimary, fontSize: 15, borderWidth: 1, borderColor: colors.border }}
            />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity onPress={() => setNameModal(false)} disabled={saving}
                style={{ flex: 1, height: 48, borderRadius: 12, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: colors.textSecondary, fontSize: 15, fontWeight: '700' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSave} disabled={saving}
                style={{ flex: 1, height: 48, borderRadius: 12, backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {saving ? <ActivityIndicator color="#0D1B12" /> : <Text style={{ color: '#0D1B12', fontSize: 15, fontWeight: '700' }}>Guardar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/** Altura aproximada del panel para posicionar el botón "Añadir punto". */
function panelHeight(hasSelection: boolean): number {
  return hasSelection ? 168 : 110;
}

const circleBtn = {
  width: 40, height: 40, borderRadius: 20, backgroundColor: '#0D1B12CC',
  alignItems: 'center' as const, justifyContent: 'center' as const,
  borderWidth: 1, borderColor: '#2D6A4F80',
};
