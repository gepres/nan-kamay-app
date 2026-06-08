import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView, StatusBar, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import {
  MapView, Camera, RasterSource, RasterLayer, setAccessToken, Logger,
} from '@maplibre/maplibre-react-native';
import { thunderforestTileUrls } from '@infrastructure/config/env';
import {
  downloadOfflineRegion, listOfflinePacks, deleteOfflinePack, estimateTiles, getPackStatus,
  type OfflinePackInfo,
} from '@infrastructure/services/OfflineTilesService';
import { useUiStore } from '@presentation/stores/uiStore';
import MissingTileKeyBanner from '@presentation/components/map/MissingTileKeyBanner';
import { colors } from '@presentation/theme/colors';

if (typeof setAccessToken === 'function') setAccessToken(null);
Logger.setLogCallback((log) => {
  if (log.message?.includes('Failed to load tile')) return true;
  if (log.message?.includes('permanent error: Canceled')) return true;
  return false;
});

const AVG_TILE_BYTES = 13000; // ~13 KB por tile raster (estimación)
const DETAIL = [
  { key: 'cerca', label: 'Cercano', extra: 2 },
  { key: 'medio', label: 'Medio', extra: 3 },
  { key: 'detalle', label: 'Detallado', extra: 4 },
] as const;

const fmtSize = (bytes: number) => bytes >= 1e6 ? `${(bytes / 1e6).toFixed(0)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`;

export default function MapOfflineScreen() {
  const insets = useSafeAreaInsets();
  const { showToast } = useUiStore();
  const mapRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);

  const [view, setView] = useState<{ ne: [number, number]; sw: [number, number]; zoom: number } | null>(null);
  const [detail, setDetail] = useState<typeof DETAIL[number]['key']>('medio');
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dlTiles, setDlTiles] = useState(0);
  const [diag, setDiag] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [packs, setPacks] = useState<OfflinePackInfo[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshPacks = () => listOfflinePacks().then(setPacks).catch(() => {});
  const stopPoll = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  useEffect(() => () => stopPoll(), []);

  useEffect(() => {
    refreshPacks();
    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getLastKnownPositionAsync();
      if (loc && cameraRef.current) {
        cameraRef.current.setCamera({ centerCoordinate: [loc.coords.longitude, loc.coords.latitude], zoomLevel: 13, animationDuration: 0 });
      }
    })().catch(() => {});
  }, []);

  const syncView = async () => {
    try {
      const b = await mapRef.current?.getVisibleBounds?.(); // [ne, sw]
      const z = await mapRef.current?.getZoom?.();
      if (b && z != null) setView({ ne: b[0], sw: b[1], zoom: z });
    } catch { /* noop */ }
  };

  const extra = DETAIL.find((d) => d.key === detail)!.extra;
  const minZoom = view ? Math.max(8, Math.round(view.zoom)) : 12;
  const maxZoom = Math.min(18, minZoom + extra);
  const tiles = view ? estimateTiles(view, minZoom, maxZoom) : 0;
  const sizeBytes = tiles * AVG_TILE_BYTES;

  const handleDownload = async () => {
    if (downloading) return;
    await syncView();
    const v = view;
    if (!v) { showToast('Mueve el mapa para fijar la zona.', 'info'); return; }
    setDownloading(true);
    setProgress(0);
    setDlTiles(0);
    setDiag('iniciando…');
    setError(null);
    const name = `nk-area-${Date.now()}`;

    const finish = () => {
      stopPoll();
      setDownloading(false);
      showToast('Zona descargada para uso sin conexión.', 'success');
      refreshPacks();
    };

    // Polling de respaldo: lee el estado real del pack por si el callback de
    // progreso no llega (así no se queda "0%" sin información).
    stopPoll();
    pollRef.current = setInterval(async () => {
      const s = await getPackStatus(name).catch(() => null);
      if (!s) return;
      setProgress(s.percentage);
      setDlTiles(s.tiles);
      setDiag(`recursos: necesita ${s.requiredResources} · bajados ${s.completedResources} · ${s.tiles} tiles`);
      if (s.percentage >= 100) finish();
    }, 1500);

    try {
      await downloadOfflineRegion(
        { name, layer: 'outdoors', bounds: { ne: v.ne, sw: v.sw }, minZoom, maxZoom },
        (pct, tiles) => { setProgress(pct); setDlTiles(tiles); if (pct >= 100) finish(); },
        (msg) => { stopPoll(); setDownloading(false); setError(msg); showToast(msg, 'error'); },
      );
      refreshPacks();
    } catch (e) {
      stopPoll();
      setDownloading(false);
      const msg = e instanceof Error ? e.message : 'No se pudo iniciar la descarga.';
      setError(msg);
      showToast(msg, 'error');
    }
  };

  const handleDelete = (name: string) => {
    Alert.alert('Borrar zona offline', '¿Eliminar los tiles descargados de esta zona?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar', style: 'destructive',
        onPress: async () => {
          try { await deleteOfflinePack(name); refreshPacks(); showToast('Zona offline borrada.', 'success'); }
          catch { showToast('No se pudo borrar la zona.', 'error'); }
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        logoEnabled={false}
        attributionEnabled={false}
        onRegionDidChange={syncView}
      >
        <RasterSource id="off-tiles" tileUrlTemplates={thunderforestTileUrls('outdoors')} tileSize={256} maxZoomLevel={18} minZoomLevel={1}>
          <RasterLayer id="off-tile-layer" sourceID="off-tiles" style={{ rasterOpacity: 1 }} />
        </RasterSource>
        <Camera ref={cameraRef} defaultSettings={{ centerCoordinate: [-75.0152, -9.19], zoomLevel: 12 }} />
      </MapView>

      {/* Marco que indica la zona a descargar (el viewport visible) */}
      <View pointerEvents="none" style={{
        position: 'absolute', top: insets.top + 70, left: 24, right: 24, bottom: 280,
        borderWidth: 2, borderColor: colors.accent, borderRadius: 10, borderStyle: 'dashed',
      }} />

      <MissingTileKeyBanner />

      {/* Header */}
      <View style={{ position: 'absolute', top: insets.top + 12, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#0D1B12CC', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#2D6A4F80' }}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, backgroundColor: '#0D1B12CC', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#2D6A4F80' }}>
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>Descargar mapa</Text>
          <Text style={{ color: colors.textMuted, fontSize: 11 }}>Encuadra la zona dentro del recuadro</Text>
        </View>
      </View>

      {/* Panel inferior */}
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.bgPrimary, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 16, paddingBottom: insets.bottom + 16, gap: 14, maxHeight: 360 }}>
        {/* Detalle (zoom) */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', letterSpacing: 1 }}>DETALLE</Text>
          <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '700' }}>≈ {fmtSize(sizeBytes)}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {DETAIL.map((d) => {
            const on = detail === d.key;
            return (
              <TouchableOpacity key={d.key} onPress={() => setDetail(d.key)}
                style={{ flex: 1, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.accent : colors.bgCard, borderWidth: 1, borderColor: on ? colors.accent : colors.border }}>
                <Text style={{ color: on ? '#0D1B12' : colors.textSecondary, fontSize: 13, fontWeight: '600' }}>{d.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={{ color: colors.textMuted, fontSize: 11 }}>
          ~{tiles.toLocaleString()} tiles · zoom {minZoom}–{maxZoom} · disponible sin señal
        </Text>

        {/* Descargar */}
        <TouchableOpacity onPress={handleDownload} disabled={downloading}
          style={{ height: 52, borderRadius: 14, backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          {downloading ? (
            <>
              <ActivityIndicator color="#0D1B12" />
              <Text style={{ color: '#0D1B12', fontSize: 15, fontWeight: '700' }}>
                Descargando… {Math.round(progress)}% · {dlTiles.toLocaleString()} tiles
              </Text>
            </>
          ) : (
            <>
              <Ionicons name="download" size={20} color="#0D1B12" />
              <Text style={{ color: '#0D1B12', fontSize: 15, fontWeight: '700' }}>Descargar para usar sin conexión</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Diagnóstico / error (para entender por qué no baja) */}
        {error && (
          <Text style={{ color: colors.danger, fontSize: 11 }} numberOfLines={3}>⚠️ {error}</Text>
        )}
        {downloading && !!diag && (
          <Text style={{ color: colors.textMuted, fontSize: 11 }}>{diag}</Text>
        )}

        {/* Zonas descargadas */}
        {packs.length > 0 && (
          <ScrollView style={{ maxHeight: 120 }} contentContainerStyle={{ gap: 8 }}>
            {packs.map((p) => (
              <View key={p.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.bgCard, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.border }}>
                <Ionicons name={p.percentage >= 100 ? 'cloud-done-outline' : 'cloud-download-outline'} size={18} color={p.percentage >= 100 ? colors.success : colors.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
                    {p.layer ?? 'outdoors'} · {fmtSize(p.completedTileSizeBytes)}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                    {p.completedTileCount.toLocaleString()} tiles{p.percentage < 100 ? ` · ${Math.round(p.percentage)}%` : ''}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => handleDelete(p.name)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
}
