import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StatusBar, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  MapView, Camera, ShapeSource, LineLayer, CircleLayer,
  setAccessToken, Logger,
} from '@maplibre/maplibre-react-native';
import { fastDistanceMeters, simplifyIndices } from '@shared/utils/geometry';
import { formatDistance } from '@shared/utils/formatters';
import { GpsPoint } from '@core/entities/GpsPoint';
import { routeRepository } from '@infrastructure/repositories/RouteRepositoryImpl';
import { refineTrackUseCase } from '@application/routes/RefineTrackUseCase';
import { detectNoisyZones, snapCoordsToReference, closeLoop, NoisyZone, CloseLoopPlan } from '@shared/utils/trackEditing';
import { fetchPathsForBbox, bboxFromCoords } from '@infrastructure/services/OsmPathsService';
import { useAuthStore } from '@presentation/stores/authStore';
import { useUiStore } from '@presentation/stores/uiStore';
import MissingTileKeyBanner from '@presentation/components/map/MissingTileKeyBanner';
import { Basemap } from '@presentation/components/map/Basemap';
import { useBasemap } from '@presentation/hooks/useBasemap';
import { colors } from '@presentation/theme/colors';

// Sin diagnóstico de tiles aquí (a diferencia del planner): silenciamos los logs
// de MapLibre para no ensuciar la consola durante la edición.
if (typeof setAccessToken === 'function') setAccessToken(null);
Logger.setLogCallback(() => true);

type Tool = 'menu' | 'move' | 'straight' | 'curve' | 'smooth' | 'trim' | 'removeSeg' | 'delPoint' | 'redraw' | 'clean' | 'close' | 'snap';
type Snapshot = { pts: GpsPoint[]; removedMs: number };

/** Herramientas de tramo (marcar inicio y fin con dos toques). */
const SPAN_TOOLS: Tool[] = ['straight', 'curve', 'removeSeg'];
/** Niveles de suavizado RDP (epsilon en metros). */
const SMOOTH_LEVELS: { label: string; eps: number }[] = [
  { label: 'Suave', eps: 3 },
  { label: 'Medio', eps: 5 },
  { label: 'Fuerte', eps: 8 },
];

export default function RefineTrackScreen() {
  const insets = useSafeAreaInsets();
  const { showToast } = useUiStore();
  const { id } = useLocalSearchParams<{ id: string }>();

  const mapRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const [zoom, setZoom] = useState(15);

  const [pts, setPts] = useState<GpsPoint[]>([]);
  const [removedMs, setRemovedMs] = useState(0);
  const [undoStack, setUndoStack] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [tool, setTool] = useState<Tool>('menu');
  const [selected, setSelected] = useState<number | null>(null);
  const [segA, setSegA] = useState<number | null>(null);

  // Redibujar: anclas del tramo (A,B) + puntos nuevos dibujados a mano.
  const [redrawA, setRedrawA] = useState<number | null>(null);
  const [redrawB, setRedrawB] = useState<number | null>(null);
  const [redrawPts, setRedrawPts] = useState<[number, number][]>([]);

  // Asistente de limpieza / cerrar lazo / pegar al mapa.
  const user = useAuthStore((s) => s.user);
  const [zones, setZones] = useState<NoisyZone[]>([]);
  const [activeZone, setActiveZone] = useState<number | null>(null);
  const [closePlan, setClosePlan] = useState<CloseLoopPlan | null>(null);
  const [snapSource, setSnapSource] = useState<'menu' | 'mine'>('menu');
  const [snapBusy, setSnapBusy] = useState(false);
  const [refRoutes, setRefRoutes] = useState<{ id: string; name: string; kind: string }[] | null>(null);

  const coords = useMemo(
    () => pts.map((p) => [p.longitude, p.latitude] as [number, number]),
    [pts],
  );

  const { mapStyleJSON, isOfflineVector } = useBasemap(
    coords[0] ? { lng: coords[0][0], lat: coords[0][1] } : null,
  );

  // Cargar los puntos de la ruta y centrar la cámara en el medio del track.
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const loaded = await routeRepository.getGpsPoints(id);
        setPts(loaded);
        if (loaded.length && cameraRef.current) {
          const mid = loaded[Math.floor(loaded.length / 2)];
          cameraRef.current.setCamera({
            centerCoordinate: [mid.longitude, mid.latitude],
            zoomLevel: 15,
            animationDuration: 0,
          });
        }
      } catch {
        showToast('No se pudo cargar el trazado.', 'error');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // En "Asistente de limpieza": recalcular zonas cada vez que cambie el trazo.
  useEffect(() => {
    if (tool === 'clean') setZones(detectNoisyZones(coords));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords, tool]);

  // En "Pegar a una ruta mía": cargar la lista de rutas de referencia.
  useEffect(() => {
    if (tool !== 'snap' || snapSource !== 'mine' || refRoutes !== null) return;
    (async () => {
      try {
        const uid = user?.id;
        if (!uid) { setRefRoutes([]); return; }
        const [planned, recorded] = await Promise.all([
          routeRepository.getPlannedRoutes(uid),
          routeRepository.getAll(uid),
        ]);
        setRefRoutes([
          ...planned.map((r) => ({ id: r.id, name: r.name, kind: 'Planificada' })),
          ...recorded.filter((r) => r.id !== id).map((r) => ({ id: r.id, name: r.name, kind: 'Grabada' })),
        ]);
      } catch { setRefRoutes([]); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, snapSource]);

  const resetRedraw = () => { setRedrawA(null); setRedrawB(null); setRedrawPts([]); };
  const leaveTool = () => { setTool('menu'); setSelected(null); setSegA(null); resetRedraw(); setActiveZone(null); setSnapSource('menu'); };
  const openTool = (t: Tool) => {
    setSelected(null); setSegA(null); resetRedraw(); setActiveZone(null);
    if (t === 'clean') setZones(detectNoisyZones(coords));
    if (t === 'close') setClosePlan(closeLoop(coords));
    if (t === 'snap') { setSnapSource('menu'); setRefRoutes(null); }
    setTool(t);
  };

  // ── Undo ──
  const pushUndo = () => setUndoStack((s) => [...s, { pts, removedMs }]);
  const undo = () => {
    if (!undoStack.length) return;
    const last = undoStack[undoStack.length - 1];
    setPts(last.pts);
    setRemovedMs(last.removedMs);
    setUndoStack((s) => s.slice(0, -1));
    setSelected(null);
    setSegA(null);
    resetRedraw();
  };
  const dirty = undoStack.length > 0;

  // ── Hit-testing tap → punto más cercano (mismo criterio que el planner) ──
  const metersPerPixel = (lat: number) =>
    (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);

  const nearestPoint = (c: [number, number]): number => {
    const mpp = metersPerPixel(c[1]);
    let hit = -1;
    let best = mpp * 22;
    for (let i = 0; i < pts.length; i++) {
      const d = fastDistanceMeters(pts[i].latitude, pts[i].longitude, c[1], c[0]);
      if (d < best) { best = d; hit = i; }
    }
    return hit;
  };

  const onMapPress = (e: any) => {
    const c = e?.geometry?.coordinates;
    if (!Array.isArray(c) || c.length < 2 || tool === 'menu' || tool === 'smooth' || tool === 'clean' || tool === 'close' || tool === 'snap') return;
    const coord = c as [number, number];

    if (tool === 'redraw') {
      if (redrawA === null) { const h = nearestPoint(coord); if (h >= 0) setRedrawA(h); return; }
      if (redrawB === null) { const h = nearestPoint(coord); if (h >= 0 && h !== redrawA) setRedrawB(h); return; }
      setRedrawPts((p) => [...p, coord]); // anclas listas → cada toque añade un punto
      return;
    }

    const hit = nearestPoint(coord);
    if (hit < 0) { setSelected(null); return; }

    if (SPAN_TOOLS.includes(tool)) {
      if (segA === null) { setSegA(hit); return; }
      if (tool === 'straight') applyStraighten(segA, hit);
      else if (tool === 'curve') applyCurve(segA, hit);
      else applyRemoveSeg(segA, hit);
      return;
    }

    // trim / delPoint → seleccionar el punto
    setSelected((s) => (s === hit ? null : hit));
  };

  // ── Operaciones (snapshotean para undo) ──
  const applyTrimBefore = () => {
    if (selected == null || selected === 0) return;
    pushUndo();
    setPts((p) => p.slice(selected));
    setSelected(null);
  };
  const applyTrimAfter = () => {
    if (selected == null || selected >= pts.length - 1) return;
    pushUndo();
    setPts((p) => p.slice(0, selected + 1));
    setSelected(null);
  };
  const applyDeletePoint = () => {
    if (selected == null) return;
    if (pts.length <= 2) { showToast('La ruta debe conservar al menos 2 puntos.', 'info'); return; }
    pushUndo();
    setPts((p) => p.filter((_, k) => k !== selected));
    setSelected(null);
  };
  const applyRemoveSeg = (a: number, b: number) => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (hi - lo < 2) { showToast('Marca dos puntos con un tramo entre ellos.', 'info'); setSegA(null); return; }
    pushUndo();
    setRemovedMs((m) => m + (pts[hi].recordedAt.getTime() - pts[lo].recordedAt.getTime()));
    setPts((p) => [...p.slice(0, lo + 1), ...p.slice(hi)]);
    setSegA(null);
  };
  const applySmooth = (eps: number) => {
    if (pts.length < 3) return;
    const idx = simplifyIndices(coords, eps);
    if (idx.length >= pts.length) { showToast('Sin cambios a este nivel.', 'info'); return; }
    const before = pts.length;
    pushUndo();
    setPts((p) => idx.map((i) => p[i]));
    showToast(`${before} → ${idx.length} puntos`, 'success');
  };
  // ── NO destructivas (conservan TODOS los puntos, solo mueven su posición) ──
  const applyStraighten = (a: number, b: number) => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (hi - lo < 2) { showToast('Marca dos puntos con un tramo entre ellos.', 'info'); setSegA(null); return; }
    pushUndo();
    setPts((p) => straightenSpan(p, lo, hi));
    setSegA(null);
    showToast('Tramo enderezado (recto).', 'success');
  };
  const applyCurve = (a: number, b: number) => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (hi - lo < 2) { showToast('Marca dos puntos con un tramo entre ellos.', 'info'); setSegA(null); return; }
    pushUndo();
    setPts((p) => smoothSpan(p, lo, hi));
    setSegA(null);
    showToast('Tramo suavizado en curva.', 'success');
  };
  const applyMovePoint = async () => {
    if (selected == null) return;
    try {
      const c = await mapRef.current?.getCenter?.(); // [lon, lat]
      if (!Array.isArray(c) || c.length < 2) return;
      pushUndo();
      setPts((p) => p.map((pt, i) => (i === selected
        ? GpsPoint.fromProps({ ...pt.toProps(), latitude: c[1], longitude: c[0] })
        : pt)));
    } catch { /* noop */ }
  };
  const applyRedraw = () => {
    if (redrawA == null || redrawB == null) return;
    const lo = Math.min(redrawA, redrawB);
    const hi = Math.max(redrawA, redrawB);
    const aPt = pts[lo];
    const bPt = pts[hi];
    const tA = aPt.recordedAt.getTime();
    const tB = bPt.recordedAt.getTime();
    const chain: [number, number][] = [
      [aPt.longitude, aPt.latitude], ...redrawPts, [bPt.longitude, bPt.latitude],
    ];
    const seg: number[] = [];
    let total = 0;
    for (let i = 1; i < chain.length; i++) {
      const d = fastDistanceMeters(chain[i - 1][1], chain[i - 1][0], chain[i][1], chain[i][0]);
      seg.push(d); total += d;
    }
    let cum = 0;
    const newPts: GpsPoint[] = redrawPts.map((rp, i) => {
      cum += seg[i];
      const frac = total > 0 ? cum / total : 0;
      return GpsPoint.create({
        routeId: id,
        latitude: rp[1],
        longitude: rp[0],
        altitude: null,
        accuracy: null,
        speed: null,
        recordedAt: new Date(tA + (tB - tA) * frac),
        sequenceIndex: 0,
      });
    });
    pushUndo();
    setPts((p) => [...p.slice(0, lo + 1), ...newPts, ...p.slice(hi)]);
    resetRedraw();
    showToast('Tramo redibujado.', 'success');
  };

  // ── Asistente de limpieza ──
  const goToZone = (z: NoisyZone, i: number) => {
    setActiveZone(i);
    const mid = pts[Math.floor((z.lo + z.hi) / 2)];
    if (mid) cameraRef.current?.setCamera({ centerCoordinate: [mid.longitude, mid.latitude], zoomLevel: 18, animationDuration: 400 });
  };
  const cleanZone = (mode: 'smooth' | 'straight') => {
    if (activeZone == null) return;
    const z = zones[activeZone];
    if (!z) return;
    pushUndo();
    setPts((p) => (mode === 'smooth' ? smoothSpan(p, z.lo, z.hi) : straightenSpan(p, z.lo, z.hi)));
    setActiveZone(null);
    showToast(mode === 'smooth' ? 'Zona suavizada.' : 'Zona enderezada.', 'success');
  };

  // ── Cerrar el lazo ──
  const applyCloseLoop = () => {
    if (!closePlan) return;
    const ta = Math.min(closePlan.trimAfter, pts.length - 1);
    pushUndo();
    const removed = pts[pts.length - 1].recordedAt.getTime() - pts[ta].recordedAt.getTime();
    if (removed > 0) setRemovedMs((m) => m + removed);
    setPts((p) => {
      const trimmed = p.slice(0, ta + 1);
      const li = trimmed.length - 1;
      trimmed[li] = GpsPoint.fromProps({ ...trimmed[li].toProps(), latitude: closePlan.snapTo[1], longitude: closePlan.snapTo[0] });
      return trimmed;
    });
    setClosePlan(null);
    showToast('Lazo cerrado.', 'success');
  };

  // ── Pegar al mapa (snap a OSM o a una ruta mía) ──
  const SNAP_MAX_DIST_M = 22;
  const applySnap = (refs: [number, number][][], maxDist = SNAP_MAX_DIST_M) => {
    if (!refs.length) { showToast('No hay caminos de referencia en esta zona.', 'info'); return; }
    const res = snapCoordsToReference(coords, refs, maxDist);
    if (res.movedCount === 0) { showToast('Ningún punto estaba cerca de un camino. Sin cambios.', 'info'); return; }
    pushUndo();
    setPts((p) => p.map((pt, i) => (res.moved[i]
      ? GpsPoint.fromProps({ ...pt.toProps(), latitude: res.coords[i][1], longitude: res.coords[i][0] })
      : pt)));
    showToast(`${res.movedCount} de ${coords.length} puntos ajustados.`, 'success');
  };
  const onSnapOsm = async () => {
    setSnapBusy(true);
    try {
      const refs = await fetchPathsForBbox(bboxFromCoords(coords));
      applySnap(refs, 20);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo descargar el mapa.', 'error');
    } finally { setSnapBusy(false); }
  };
  const onSnapMine = async (routeId: string) => {
    setSnapBusy(true);
    try {
      const refPts = await routeRepository.getGpsPoints(routeId);
      applySnap([refPts.map((p) => [p.longitude, p.latitude] as [number, number])], 30);
    } catch {
      showToast('No se pudo cargar la ruta de referencia.', 'error');
    } finally { setSnapBusy(false); }
  };

  // ── Guardar ──
  const distanceMeters = useMemo(() => {
    let d = 0;
    for (let i = 1; i < pts.length; i++) {
      d += fastDistanceMeters(pts[i - 1].latitude, pts[i - 1].longitude, pts[i].latitude, pts[i].longitude);
    }
    return d;
  }, [pts]);

  const handleSave = () => {
    if (pts.length < 2) { showToast('La ruta debe tener al menos 2 puntos.', 'error'); return; }
    Alert.alert(
      'Guardar trazado',
      'Se reemplazará el trazado y se recalcularán distancia, duración y elevación. Esta acción no se puede deshacer una vez guardada.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Guardar', style: 'destructive', onPress: doSave },
      ],
    );
  };
  const doSave = async () => {
    setSaving(true);
    try {
      const first = pts[0].recordedAt.getTime();
      const last = pts[pts.length - 1].recordedAt.getTime();
      const durationSeconds = Math.max(0, Math.round((last - first - removedMs) / 1000));
      await refineTrackUseCase(id, pts, durationSeconds);
      showToast('Trazado actualizado.', 'success');
      router.back();
    } catch {
      showToast('No se pudo guardar el trazado.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const confirmExit = () => {
    if (!dirty) { router.back(); return; }
    Alert.alert('Descartar cambios', 'Tienes ediciones sin guardar. ¿Salir y descartarlas?', [
      { text: 'Seguir editando', style: 'cancel' },
      { text: 'Descartar', style: 'destructive', onPress: () => router.back() },
    ]);
  };

  // ── GeoJSON ──
  const lineGeoJson = useMemo<GeoJSON.Feature<GeoJSON.LineString> | null>(
    () => (coords.length > 1 ? { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} } : null),
    [coords],
  );
  const dotsGeoJson = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(
    () => ({
      type: 'FeatureCollection',
      features: pts.map((p, i) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] },
        properties: {
          role: i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'mid',
          selected: i === selected,
          marked: i === segA || i === redrawA || i === redrawB,
        },
      })),
    }),
    [pts, selected, segA, redrawA, redrawB],
  );
  const redrawGeoJson = useMemo<GeoJSON.Feature<GeoJSON.LineString> | null>(() => {
    if (redrawA == null || redrawB == null) return null;
    const lo = Math.min(redrawA, redrawB);
    const hi = Math.max(redrawA, redrawB);
    return {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [[pts[lo].longitude, pts[lo].latitude], ...redrawPts, [pts[hi].longitude, pts[hi].latitude]],
      },
      properties: {},
    };
  }, [redrawA, redrawB, redrawPts, pts]);
  const redrawDotsGeoJson = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(
    () => ({
      type: 'FeatureCollection',
      features: redrawPts.map((c) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: {} })),
    }),
    [redrawPts],
  );

  const inTool = tool !== 'menu';
  const isSpan = SPAN_TOOLS.includes(tool);

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
          <ShapeSource id="refine-line" shape={lineGeoJson}>
            <LineLayer id="refine-line-layer" style={{ lineColor: colors.accent, lineWidth: 4, lineCap: 'round', lineJoin: 'round' }} />
          </ShapeSource>
        )}

        {redrawGeoJson && (
          <ShapeSource id="refine-redraw-line" shape={redrawGeoJson}>
            <LineLayer id="refine-redraw-line-layer" style={{ lineColor: colors.success, lineWidth: 4, lineDasharray: [2, 1], lineCap: 'round', lineJoin: 'round' }} />
          </ShapeSource>
        )}

        {pts.length > 0 && (
          <ShapeSource id="refine-dots" shape={dotsGeoJson}>
            <CircleLayer
              id="refine-dots-layer"
              style={{
                circleRadius: ['case', ['any', ['get', 'selected'], ['get', 'marked']], 8, 4] as any,
                circleColor: ['case',
                  ['get', 'marked'], colors.accent,
                  ['match', ['get', 'role'], 'start', colors.success, 'end', colors.danger, colors.accent],
                ] as any,
                circleStrokeColor: '#FFFFFF',
                circleStrokeWidth: ['case', ['any', ['get', 'selected'], ['get', 'marked']], 3, 1] as any,
              }}
            />
          </ShapeSource>
        )}

        {redrawPts.length > 0 && (
          <ShapeSource id="refine-redraw-dots" shape={redrawDotsGeoJson}>
            <CircleLayer id="refine-redraw-dots-layer" style={{ circleRadius: 6, circleColor: colors.success, circleStrokeColor: '#FFFFFF', circleStrokeWidth: 2 }} />
          </ShapeSource>
        )}
      </MapView>

      <MissingTileKeyBanner />

      {/* Crosshair central (solo al mover un punto) */}
      {tool === 'move' && selected != null && (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: '#FFFFFFDD', alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.accent }} />
          </View>
        </View>
      )}

      {/* Header */}
      <View style={{ position: 'absolute', top: insets.top + 12, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TouchableOpacity onPress={confirmExit} style={circleBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, backgroundColor: '#0D1B12CC', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#2D6A4F80' }}>
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }} numberOfLines={1}>Editar trazado</Text>
          <Text style={{ color: colors.textMuted, fontSize: 11 }}>
            {formatDistance(distanceMeters)} · {pts.length} puntos
          </Text>
        </View>
        <TouchableOpacity onPress={undo} disabled={!dirty} style={[circleBtn, { opacity: dirty ? 1 : 0.5 }]}>
          <Ionicons name="arrow-undo" size={20} color={colors.accent} />
        </TouchableOpacity>
      </View>

      {loading && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      )}

      {/* Panel inferior */}
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.bgPrimary, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 14, paddingBottom: insets.bottom + 16, gap: 14 }}>
        {!inTool ? (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <ToolBtn icon="move-outline" label="Mover" onPress={() => openTool('move')} />
              <ToolBtn icon="remove-outline" label="Recto" onPress={() => openTool('straight')} />
              <ToolBtn icon="analytics-outline" label="Curva" onPress={() => openTool('curve')} />
              <ToolBtn icon="sparkles-outline" label="Suavizar" onPress={() => openTool('smooth')} />
              <ToolBtn icon="pulse-outline" label="Asistente" onPress={() => openTool('clean')} />
              <ToolBtn icon="magnet-outline" label="Pegar" onPress={() => openTool('snap')} />
              <ToolBtn icon="ellipse-outline" label="Cerrar" onPress={() => openTool('close')} />
              <ToolBtn icon="cut-outline" label="Recortar" onPress={() => openTool('trim')} />
              <ToolBtn icon="remove-circle-outline" label="Quitar" onPress={() => openTool('removeSeg')} />
              <ToolBtn icon="trash-outline" label="Borrar" onPress={() => openTool('delPoint')} />
              <ToolBtn icon="pencil-outline" label="Redibujar" onPress={() => openTool('redraw')} />
            </View>
            <TouchableOpacity onPress={handleSave} disabled={!dirty || saving}
              style={{ height: 50, borderRadius: 14, backgroundColor: dirty ? colors.accent : colors.bgCard, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: saving ? 0.7 : 1 }}>
              {saving ? <ActivityIndicator color="#0D1B12" /> : (
                <>
                  <Ionicons name="checkmark" size={20} color={dirty ? '#0D1B12' : colors.textMuted} />
                  <Text style={{ color: dirty ? '#0D1B12' : colors.textMuted, fontSize: 15, fontWeight: '700' }}>Guardar cambios</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '700' }}>{TOOL_TITLE[tool]}</Text>
              <TouchableOpacity onPress={leaveTool}>
                <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: '700' }}>Listo</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
              {tool === 'redraw'
                ? (redrawA === null ? 'Toca el punto donde empieza el tramo a redibujar.'
                  : redrawB === null ? 'Ahora toca el punto donde termina el tramo.'
                  : 'Toca el mapa para trazar el nuevo recorrido; luego Aplicar.')
                : isSpan && segA != null ? 'Ahora toca el otro extremo del tramo.'
                : TOOL_HINT[tool]}
            </Text>

            {tool === 'smooth' && (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {SMOOTH_LEVELS.map((lv) => (
                  <TouchableOpacity key={lv.label} onPress={() => applySmooth(lv.eps)}
                    style={{ flex: 1, height: 46, borderRadius: 12, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>{lv.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {tool === 'clean' && (
              <ScrollView style={{ maxHeight: 240 }} contentContainerStyle={{ gap: 8 }}>
                {zones.length === 0 ? (
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    No se detectaron zonas con serpenteo. ¡Tu trazo está limpio!
                  </Text>
                ) : zones.map((z, i) => (
                  <View key={`${z.lo}-${z.hi}`} style={{ backgroundColor: i === activeZone ? colors.bgElevated : colors.bgCard, borderRadius: 12, borderWidth: 1, borderColor: i === activeZone ? colors.accent : colors.border, padding: 10, gap: 8 }}>
                    <TouchableOpacity onPress={() => goToZone(z, i)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View>
                        <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '700' }}>Zona {i + 1}</Text>
                        <Text style={{ color: colors.textMuted, fontSize: 11 }}>serpenteo {z.sinuosity.toFixed(1)}× · {formatDistance(z.lengthM)}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="locate-outline" size={16} color={colors.accent} />
                        <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '700' }}>Ir</Text>
                      </View>
                    </TouchableOpacity>
                    {i === activeZone && (
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity onPress={() => cleanZone('smooth')} style={zoneActionStyle}>
                          <Text style={zoneActionText}>Suavizar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => cleanZone('straight')} style={zoneActionStyle}>
                          <Text style={zoneActionText}>Enderezar</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))}
              </ScrollView>
            )}

            {tool === 'close' && (
              <TouchableOpacity onPress={applyCloseLoop} disabled={!closePlan}
                style={{ height: 46, borderRadius: 12, backgroundColor: closePlan ? colors.accent : colors.bgCard, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: closePlan ? 1 : 0.7 }}>
                <Ionicons name="ellipse-outline" size={18} color={closePlan ? '#0D1B12' : colors.textMuted} />
                <Text style={{ color: closePlan ? '#0D1B12' : colors.textMuted, fontSize: 14, fontWeight: '700' }}>
                  {closePlan ? `Cerrar el lazo (hueco ${Math.round(closePlan.gapMeters)} m)` : 'El inicio y el fin están muy lejos'}
                </Text>
              </TouchableOpacity>
            )}

            {tool === 'snap' && (
              snapBusy ? (
                <View style={{ height: 80, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <ActivityIndicator color={colors.accent} />
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>Procesando…</Text>
                </View>
              ) : snapSource === 'menu' ? (
                <View style={{ gap: 8 }}>
                  <TouchableOpacity onPress={onSnapOsm} style={snapBtnStyle}>
                    <Ionicons name="map-outline" size={20} color={colors.accent} />
                    <View style={{ flex: 1 }}>
                      <Text style={snapBtnTitle}>Pegar a calles/senderos (OSM)</Text>
                      <Text style={snapBtnSub}>Descarga el mapa de la zona y ajusta el trazo. Requiere internet la 1.ª vez.</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setSnapSource('mine')} style={snapBtnStyle}>
                    <Ionicons name="git-branch-outline" size={20} color={colors.accent} />
                    <View style={{ flex: 1 }}>
                      <Text style={snapBtnTitle}>Pegar a una ruta mía</Text>
                      <Text style={snapBtnSub}>Ajusta a una ruta que planificaste o grabaste antes.</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  <TouchableOpacity onPress={() => setSnapSource('menu')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="arrow-back" size={16} color={colors.textSecondary} />
                    <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '700' }}>Atrás</Text>
                  </TouchableOpacity>
                  {refRoutes === null ? (
                    <ActivityIndicator color={colors.accent} />
                  ) : refRoutes.length === 0 ? (
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>No tienes otras rutas para usar de referencia.</Text>
                  ) : (
                    <ScrollView style={{ maxHeight: 200 }}>
                      {refRoutes.map((r) => (
                        <TouchableOpacity key={r.id} onPress={() => onSnapMine(r.id)}
                          style={{ paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                          <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '600', flex: 1 }} numberOfLines={1}>{r.name}</Text>
                          <Text style={{ color: colors.textMuted, fontSize: 11 }}>{r.kind}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}
                </View>
              )
            )}

            {tool === 'move' && selected != null && (
              <TouchableOpacity onPress={applyMovePoint}
                style={{ height: 46, borderRadius: 12, backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Ionicons name="locate" size={18} color="#0D1B12" />
                <Text style={{ color: '#0D1B12', fontSize: 14, fontWeight: '700' }}>Mover aquí (al centro)</Text>
              </TouchableOpacity>
            )}

            {tool === 'trim' && selected != null && (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity onPress={applyTrimBefore} disabled={selected === 0}
                  style={{ flex: 1, height: 46, borderRadius: 12, backgroundColor: colors.bgElevated, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: selected === 0 ? 0.5 : 1 }}>
                  <Ionicons name="arrow-back" size={16} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>Quitar antes</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={applyTrimAfter} disabled={selected >= pts.length - 1}
                  style={{ flex: 1, height: 46, borderRadius: 12, backgroundColor: colors.bgElevated, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: selected >= pts.length - 1 ? 0.5 : 1 }}>
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>Quitar después</Text>
                  <Ionicons name="arrow-forward" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            )}

            {tool === 'delPoint' && selected != null && (
              <TouchableOpacity onPress={applyDeletePoint}
                style={{ height: 46, borderRadius: 12, backgroundColor: colors.danger + '22', borderWidth: 1, borderColor: colors.danger, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
                <Text style={{ color: colors.danger, fontSize: 14, fontWeight: '700' }}>Borrar este punto</Text>
              </TouchableOpacity>
            )}

            {isSpan && segA != null && (
              <TouchableOpacity onPress={() => setSegA(null)}
                style={{ height: 46, borderRadius: 12, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: '700' }}>Cancelar tramo</Text>
              </TouchableOpacity>
            )}

            {tool === 'redraw' && redrawA != null && redrawB != null && (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={() => setRedrawPts((p) => p.slice(0, -1))} disabled={!redrawPts.length}
                  style={{ flex: 1, height: 46, borderRadius: 12, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', opacity: redrawPts.length ? 1 : 0.5 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '700' }}>Deshacer punto</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={resetRedraw}
                  style={{ flex: 1, height: 46, borderRadius: 12, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '700' }}>Reiniciar</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={applyRedraw}
                  style={{ flex: 1, height: 46, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#0D1B12', fontSize: 13, fontWeight: '700' }}>Aplicar</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const TOOL_TITLE: Record<Exclude<Tool, 'menu'>, string> = {
  move: 'Mover punto',
  straight: 'Enderezar tramo (recto)',
  curve: 'Suavizar tramo (curva)',
  smooth: 'Suavizar trazado',
  trim: 'Recortar extremos',
  removeSeg: 'Quitar tramo',
  delPoint: 'Borrar punto',
  redraw: 'Redibujar tramo',
  clean: 'Asistente de limpieza',
  close: 'Cerrar el lazo',
  snap: 'Pegar al mapa',
};
const TOOL_HINT: Record<Exclude<Tool, 'menu'>, string> = {
  move: 'Toca un punto, centra el mapa donde lo quieres y pulsa "Mover aquí".',
  straight: 'Toca dos puntos: lo de en medio se alinea en recta. NO borra puntos.',
  curve: 'Toca dos puntos: el tramo se suaviza en una curva fluida. NO borra puntos.',
  smooth: 'Reduce puntos y endereza el serpenteo (elimina puntos redundantes).',
  trim: 'Toca un punto y elige qué extremo quitar (antes o después de él).',
  removeSeg: 'Toca el inicio y el fin del tramo a quitar; se unirán en línea recta.',
  delPoint: 'Toca un punto suelto/erróneo para borrarlo.',
  redraw: 'Marca el tramo y vuelve a trazarlo a mano tocando el mapa.',
  clean: 'Te muestro las zonas con más serpenteo. Toca "Ir" para verlas y suaviza o endereza.',
  close: 'Si terminaste cerca de donde empezaste, uno el final con el inicio para cerrar el bucle.',
  snap: 'Ajusta el trazo a los caminos reales (OSM) o a una ruta tuya. Solo mueve puntos con un camino muy cerca.',
};

/** Proyecta los puntos interiores de [lo,hi] sobre la recta A–B (los endereza
 *  sin borrarlos ni tocar su altitud/tiempo). */
function straightenSpan(pts: GpsPoint[], lo: number, hi: number): GpsPoint[] {
  const a = pts[lo];
  const b = pts[hi];
  const mLat = 111320;
  const mLon = 111320 * Math.cos((a.latitude * Math.PI) / 180);
  const bx = (b.longitude - a.longitude) * mLon;
  const by = (b.latitude - a.latitude) * mLat;
  const len2 = bx * bx + by * by;
  return pts.map((p, i) => {
    if (i <= lo || i >= hi) return p;
    const px = (p.longitude - a.longitude) * mLon;
    const py = (p.latitude - a.latitude) * mLat;
    const t = len2 === 0 ? 0 : (px * bx + py * by) / len2;
    return GpsPoint.fromProps({
      ...p.toProps(),
      latitude: a.latitude + (t * by) / mLat,
      longitude: a.longitude + (t * bx) / mLon,
    });
  });
}

/** Suaviza [lo,hi] con promediado laplaciano (curva fluida) dejando fijos los
 *  extremos y CONSERVANDO todos los puntos (solo reposiciona). */
function smoothSpan(pts: GpsPoint[], lo: number, hi: number, iterations = 8, lambda = 0.5): GpsPoint[] {
  let lon = pts.map((p) => p.longitude);
  let lat = pts.map((p) => p.latitude);
  for (let it = 0; it < iterations; it++) {
    const nLon = lon.slice();
    const nLat = lat.slice();
    for (let i = lo + 1; i < hi; i++) {
      nLon[i] = lon[i] * (1 - lambda) + ((lon[i - 1] + lon[i + 1]) / 2) * lambda;
      nLat[i] = lat[i] * (1 - lambda) + ((lat[i - 1] + lat[i + 1]) / 2) * lambda;
    }
    lon = nLon; lat = nLat;
  }
  return pts.map((p, i) => (i > lo && i < hi
    ? GpsPoint.fromProps({ ...p.toProps(), latitude: lat[i], longitude: lon[i] })
    : p));
}

function ToolBtn({ icon, label, onPress }: { icon: any; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress}
      style={{ width: '23%', paddingVertical: 10, borderRadius: 12, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, alignItems: 'center', gap: 4 }}>
      <Ionicons name={icon} size={20} color={colors.accent} />
      <Text style={{ color: colors.textSecondary, fontSize: 10, fontWeight: '600' }} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

const circleBtn = {
  width: 40, height: 40, borderRadius: 20, backgroundColor: '#0D1B12CC',
  alignItems: 'center' as const, justifyContent: 'center' as const,
  borderWidth: 1, borderColor: '#2D6A4F80',
};

const zoneActionStyle = {
  flex: 1, height: 42, borderRadius: 10, backgroundColor: colors.bgElevated,
  alignItems: 'center' as const, justifyContent: 'center' as const,
};
const zoneActionText = { color: '#fff', fontSize: 13, fontWeight: '700' as const };
const snapBtnStyle = {
  flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12,
  backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border,
  borderRadius: 12, padding: 12,
};
const snapBtnTitle = { color: colors.textPrimary, fontSize: 14, fontWeight: '700' as const };
const snapBtnSub = { color: colors.textMuted, fontSize: 11, marginTop: 2 };
