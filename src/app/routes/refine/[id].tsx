import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StatusBar, Alert, ActivityIndicator } from 'react-native';
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
import { useUiStore } from '@presentation/stores/uiStore';
import MissingTileKeyBanner from '@presentation/components/map/MissingTileKeyBanner';
import { Basemap } from '@presentation/components/map/Basemap';
import { useBasemap } from '@presentation/hooks/useBasemap';
import { colors } from '@presentation/theme/colors';

// Sin diagnóstico de tiles aquí (a diferencia del planner): silenciamos los logs
// de MapLibre para no ensuciar la consola durante la edición.
if (typeof setAccessToken === 'function') setAccessToken(null);
Logger.setLogCallback(() => true);

type Tool = 'menu' | 'trim' | 'smooth' | 'removeSeg' | 'delPoint' | 'redraw';
type Snapshot = { pts: GpsPoint[]; removedMs: number };

/** Niveles de suavizado (epsilon RDP en metros). */
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

  const resetRedraw = () => { setRedrawA(null); setRedrawB(null); setRedrawPts([]); };
  const leaveTool = () => { setTool('menu'); setSelected(null); setSegA(null); resetRedraw(); };

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
    if (!Array.isArray(c) || c.length < 2 || tool === 'menu' || tool === 'smooth') return;
    const coord = c as [number, number];

    if (tool === 'redraw') {
      if (redrawA === null) { const h = nearestPoint(coord); if (h >= 0) setRedrawA(h); return; }
      if (redrawB === null) { const h = nearestPoint(coord); if (h >= 0 && h !== redrawA) setRedrawB(h); return; }
      // Anclas listas → cada toque añade un punto al nuevo recorrido.
      setRedrawPts((p) => [...p, coord]);
      return;
    }

    const hit = nearestPoint(coord);
    if (hit < 0) { setSelected(null); return; }

    if (tool === 'removeSeg') {
      if (segA === null) { setSegA(hit); }
      else { applyRemoveSeg(segA, hit); }
      return;
    }
    setSelected((s) => (s === hit ? null : hit));
  };

  // ── Operaciones (cada una snapshotea para undo y preserva los GpsPoint) ──
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
    if (hi - lo < 2) {
      showToast('Marca dos puntos con un tramo entre ellos.', 'info');
      setSegA(null);
      return;
    }
    pushUndo();
    // El span removido NO debe contar en la duración (tiempo del tramo erróneo).
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
  const applyRedraw = () => {
    if (redrawA == null || redrawB == null) return;
    const lo = Math.min(redrawA, redrawB);
    const hi = Math.max(redrawA, redrawB);
    const aPt = pts[lo];
    const bPt = pts[hi];
    const tA = aPt.recordedAt.getTime();
    const tB = bPt.recordedAt.getTime();
    // Cadena A → puntos nuevos → B, para repartir el tiempo por distancia acumulada.
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
      cum += seg[i]; // distancia A → este punto
      const frac = total > 0 ? cum / total : 0;
      return GpsPoint.create({
        routeId: id,
        latitude: rp[1],
        longitude: rp[0],
        altitude: null, // sin altitud GPS; ofrecer "Ajustar elevación" luego
        accuracy: null,
        speed: null,
        recordedAt: new Date(tA + (tB - tA) * frac),
        sequenceIndex: 0, // se re-secuencia en replaceGpsPoints
      });
    });
    pushUndo();
    // El tramo nuevo ocupa la MISMA ventana temporal (tA..tB) → la duración no
    // cambia (no toca removedMs); solo cambia la geometría/distancia.
    setPts((p) => [...p.slice(0, lo + 1), ...newPts, ...p.slice(hi)]);
    resetRedraw();
    showToast('Tramo redibujado.', 'success');
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

  // ── GeoJSON de la línea, los puntos y el tramo redibujado ──
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
  // Vista previa del tramo redibujado: A → puntos nuevos → B.
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
              <ToolBtn icon="cut-outline" label="Recortar" onPress={() => { leaveTool(); setTool('trim'); }} />
              <ToolBtn icon="sparkles-outline" label="Suavizar" onPress={() => { leaveTool(); setTool('smooth'); }} />
              <ToolBtn icon="remove-circle-outline" label="Quitar tramo" onPress={() => { leaveTool(); setTool('removeSeg'); }} />
              <ToolBtn icon="trash-outline" label="Borrar punto" onPress={() => { leaveTool(); setTool('delPoint'); }} />
              <ToolBtn icon="pencil-outline" label="Redibujar" onPress={() => { leaveTool(); setTool('redraw'); }} />
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

            {tool === 'removeSeg' && segA != null && (
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
  trim: 'Recortar extremos',
  smooth: 'Suavizar trazado',
  removeSeg: 'Quitar tramo',
  delPoint: 'Borrar punto',
  redraw: 'Redibujar tramo',
};
const TOOL_HINT: Record<Exclude<Tool, 'menu'>, string> = {
  trim: 'Toca un punto y elige qué extremo quitar (antes o después de él).',
  smooth: 'Reduce el serpenteo del GPS. Más fuerte = trazo más recto.',
  removeSeg: 'Toca el inicio y el fin del tramo a quitar; se unirán en línea recta.',
  delPoint: 'Toca un punto suelto/erróneo para borrarlo.',
  redraw: 'Marca el tramo y vuelve a trazarlo a mano tocando el mapa.',
};

function ToolBtn({ icon, label, onPress }: { icon: any; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress}
      style={{ width: '31%', paddingVertical: 10, borderRadius: 12, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, alignItems: 'center', gap: 4 }}>
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
