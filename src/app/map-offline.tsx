import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator, ScrollView, StatusBar, Alert,
  TextInput, Keyboard, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Clipboard from 'expo-clipboard';
import {
  MapView, Camera, RasterSource, RasterLayer, ShapeSource, FillLayer, LineLayer,
  CircleLayer, MarkerView, setAccessToken, Logger,
} from '@maplibre/maplibre-react-native';
import {
  listDownloadedRegions, deleteRegion, downloadRegion, ensureAssetsPack, isAssetsReady,
  getOfflineDiagnostics,
  type DownloadedRegion,
} from '@infrastructure/services/OfflineMapsService';
import {
  OFFLINE_REGION_CATALOG, OFFLINE_ASSETS_PACK_URL,
  type OfflineRegionCatalogItem,
} from '@shared/constants/offlineRegions';
import { thunderforestTileUrls } from '@infrastructure/config/env';
import MissingTileKeyBanner from '@presentation/components/map/MissingTileKeyBanner';
import { useNetworkStatus } from '@presentation/hooks/useNetworkStatus';
import { useUiStore } from '@presentation/stores/uiStore';
import { trackEvent } from '@infrastructure/services/AnalyticsService';
import { colors } from '@presentation/theme/colors';

if (typeof setAccessToken === 'function') setAccessToken(null);
Logger.setLogCallback((log) => {
  if (log.message?.includes('Failed to load tile')) return true;
  if (log.message?.includes('permanent error: Canceled')) return true;
  return false;
});

// ---- helpers geográficos (locales, sin dependencias) -----------------------
const fmtSize = (bytes: number) => bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`;
const fmtKm = (km: number) => km < 1 ? 'aquí mismo' : km < 10 ? `a ${km.toFixed(1)} km` : `a ${Math.round(km)} km`;

type Bbox = [number, number, number, number]; // [oeste, sur, este, norte]
const regionCenter = (b: Bbox): [number, number] => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
const bboxContains = (b: Bbox, lng: number, lat: number) => lng >= b[0] && lng <= b[2] && lat >= b[1] && lat <= b[3];
const bboxAreaDeg = (b: Bbox) => (b[2] - b[0]) * (b[3] - b[1]);

function unionBbox(items: { bbox: Bbox }[]): Bbox {
  let w = 180, s = 90, e = -180, n = -90;
  for (const it of items) {
    w = Math.min(w, it.bbox[0]); s = Math.min(s, it.bbox[1]);
    e = Math.max(e, it.bbox[2]); n = Math.max(n, it.bbox[3]);
  }
  return [w, s, e, n];
}

function haversineKm(aLng: number, aLat: number, bLng: number, bLat: number): number {
  const R = 6371, toRad = Math.PI / 180;
  const dLat = (bLat - aLat) * toRad, dLng = (bLng - aLng) * toRad;
  const la1 = aLat * toRad, la2 = bLat * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

interface GeoResult { label: string; short: string; lng: number; lat: number; }
interface SearchInfo { label: string; coveredId: string | null; nearestId: string | null; km: number; }

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

export default function MapOfflineScreen() {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const { showToast } = useUiStore();
  const online = useNetworkStatus();
  const mapH = Math.max(210, Math.min(330, Math.round(winH * 0.32)));

  const [downloaded, setDownloaded] = useState<DownloadedRegion[]>([]);
  const [assetsReady, setAssetsReady] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const [repairing, setRepairing] = useState(false);

  // Buscador + mapa
  const [myLoc, setMyLoc] = useState<{ lng: number; lat: number } | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [searchedPoint, setSearchedPoint] = useState<{ lng: number; lat: number; label: string } | null>(null);
  const [searchInfo, setSearchInfo] = useState<SearchInfo | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusBounds, setFocusBounds] = useState<Bbox | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const cameraRef = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    listDownloadedRegions().then(setDownloaded).catch(() => {});
    isAssetsReady().then(setAssetsReady).catch(() => {});
  }, []);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  // Auto-reparación de fuentes: un pack viejo se extrajo con nombres CON espacios
  // y el mapa offline salía sin etiquetas. `isAssetsReady` ahora exige el nombre
  // correcto; si falta y hay red, re-extrae el pack (≈400 KB) automáticamente.
  useEffect(() => {
    if (!online || OFFLINE_REGION_CATALOG.length === 0 || !OFFLINE_ASSETS_PACK_URL) return;
    let alive = true;
    (async () => {
      try {
        if (await isAssetsReady()) return;
        if (!alive) return;
        setRepairing(true);
        await ensureAssetsPack();
        if (alive) { setAssetsReady(true); showToast('Fuentes del mapa actualizadas.', 'success'); }
      } catch { /* sin red o fallo: se reintenta al volver a abrir */ }
      finally { if (alive) setRepairing(false); }
    })();
    return () => { alive = false; };
  }, [online]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ubicación (best-effort, sin pedir permiso aquí): para "sugeridas cerca de ti".
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getLastKnownPositionAsync();
        if (alive && loc) setMyLoc({ lng: loc.coords.longitude, lat: loc.coords.latitude });
      } catch { /* sin ubicación, no pasa nada */ }
    })();
    return () => { alive = false; };
  }, []);

  // Encuadre inicial: toda la cobertura; cuando llega mi ubicación, acerca a la
  // región más cercana (una sola vez, si aún no hay foco por búsqueda).
  useEffect(() => {
    if (!focusBounds) setFocusBounds(unionBbox(OFFLINE_REGION_CATALOG));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const fittedToMe = useRef(false);
  useEffect(() => {
    if (myLoc && !fittedToMe.current && !searchedPoint) {
      fittedToMe.current = true;
      const near = nearestRegion(myLoc.lng, myLoc.lat);
      if (near) setFocusBounds(near.bbox as Bbox);
    }
  }, [myLoc, searchedPoint]);

  // Mueve la cámara cuando cambia el foco (y el mapa ya cargó).
  useEffect(() => {
    if (mapReady && focusBounds && cameraRef.current) {
      const [w, s, e, n] = focusBounds;
      try { cameraRef.current.fitBounds([e, n], [w, s], 56, 650); } catch { /* noop */ }
    }
  }, [mapReady, focusBounds]);

  const isDownloaded = (id: string) => downloaded.some((r) => r.id === id);

  function nearestRegion(lng: number, lat: number): OfflineRegionCatalogItem | null {
    let best: OfflineRegionCatalogItem | null = null, bestKm = Infinity;
    for (const it of OFFLINE_REGION_CATALOG) {
      const [cx, cy] = regionCenter(it.bbox);
      const km = haversineKm(lng, lat, cx, cy);
      if (km < bestKm) { bestKm = km; best = it; }
    }
    return best;
  }

  // Región que cubre un punto (la más específica = menor área) o null.
  function coveringRegion(lng: number, lat: number): OfflineRegionCatalogItem | null {
    const hits = OFFLINE_REGION_CATALOG.filter((it) => bboxContains(it.bbox, lng, lat));
    if (hits.length === 0) return null;
    return hits.sort((a, b) => bboxAreaDeg(a.bbox) - bboxAreaDeg(b.bbox))[0];
  }

  // ---- buscador (Nominatim / OSM) ------------------------------------------
  const doSearch = async () => {
    const q = query.trim();
    if (!q) return;
    Keyboard.dismiss();
    if (!online) { setSearchErr('Sin conexión: conéctate a internet para buscar lugares.'); setResults([]); return; }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const timer = setTimeout(() => ctrl.abort(), 15000);
    setSearching(true); setSearchErr(null); setResults([]);
    try {
      const url = `${NOMINATIM}?format=jsonv2&limit=6&countrycodes=pe&accept-language=es&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'NanKamay/1.0 (offline trekking maps)', 'Accept-Language': 'es' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const mapped: GeoResult[] = (Array.isArray(data) ? data : [])
        .map((d: any) => ({
          label: String(d.display_name ?? ''),
          short: String(d.name || (d.display_name ?? '').split(',')[0] || ''),
          lng: parseFloat(d.lon), lat: parseFloat(d.lat),
        }))
        .filter((r: GeoResult) => Number.isFinite(r.lng) && Number.isFinite(r.lat));
      if (mapped.length === 0) setSearchErr(`Sin resultados para "${q}".`);
      setResults(mapped);
    } catch (e: any) {
      if (e?.name === 'AbortError') setSearchErr('La búsqueda tardó demasiado. Intenta de nuevo.');
      else setSearchErr('No se pudo buscar. Revisa tu conexión.');
    } finally {
      clearTimeout(timer);
      setSearching(false);
    }
  };

  const applyResult = (r: GeoResult) => {
    setResults([]);
    setQuery(r.short);
    setSearchedPoint({ lng: r.lng, lat: r.lat, label: r.short });
    const covering = coveringRegion(r.lng, r.lat);
    if (covering) {
      setSelectedId(covering.id);
      setFocusBounds(covering.bbox as Bbox);
      setSearchInfo({ label: r.short, coveredId: covering.id, nearestId: covering.id, km: 0 });
    } else {
      setSelectedId(null);
      // Encuadre alrededor del punto buscado para ubicarlo.
      setFocusBounds([r.lng - 0.2, r.lat - 0.2, r.lng + 0.2, r.lat + 0.2]);
      const near = nearestRegion(r.lng, r.lat);
      const [cx, cy] = near ? regionCenter(near.bbox) : [0, 0];
      setSearchInfo({ label: r.short, coveredId: null, nearestId: near?.id ?? null, km: near ? haversineKm(r.lng, r.lat, cx, cy) : 0 });
    }
  };

  const clearSearch = () => {
    abortRef.current?.abort();
    setQuery(''); setResults([]); setSearchErr(null); setSearchedPoint(null); setSearchInfo(null);
  };

  const selectRegion = (id: string) => {
    const it = OFFLINE_REGION_CATALOG.find((c) => c.id === id);
    setSelectedId(id);
    if (it) setFocusBounds(it.bbox as Bbox);
  };

  // ---- descargar / borrar ---------------------------------------------------
  const handleDownload = async (item: OfflineRegionCatalogItem) => {
    if (downloadingId) return;
    setDownloadingId(item.id); setProgress(0); setPreparing(false);
    let inAssets = false;
    try {
      await downloadRegion(item, (pct) => setProgress(pct));
      inAssets = true; setPreparing(true);
      await ensureAssetsPack((pct) => setProgress(pct));
      showToast('Zona descargada para usar sin conexión.', 'success');
      trackEvent('offline_map_downloaded', { region: item.id });
      refresh();
    } catch (e) {
      refresh();
      const msg = e instanceof Error ? e.message : 'error';
      showToast(
        inAssets ? `Zona descargada, pero faltan las fuentes (mapa sin etiquetas): ${msg}` : `No se pudo descargar la zona: ${msg}`,
        'error',
      );
    } finally {
      setDownloadingId(null); setPreparing(false);
    }
  };

  const handleDelete = (region: DownloadedRegion) => {
    Alert.alert('Borrar zona offline', `¿Eliminar "${region.name}" (${fmtSize(region.bytes)})?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar', style: 'destructive',
        onPress: async () => {
          try { await deleteRegion(region.id); refresh(); showToast('Zona offline borrada.', 'success'); }
          catch { showToast('No se pudo borrar la zona.', 'error'); }
        },
      },
    ]);
  };

  const handleDiag = async () => {
    try {
      const txt = await getOfflineDiagnostics();
      Alert.alert('Diagnóstico offline', txt, [
        {
          text: 'Copiar',
          onPress: () => {
            Clipboard.setStringAsync(txt)
              .then(() => showToast('Diagnóstico copiado al portapapeles.', 'success'))
              .catch(() => showToast('No se pudo copiar.', 'error'));
          },
        },
        { text: 'OK' },
      ]);
    } catch (e) {
      Alert.alert('Diagnóstico offline', `Error: ${e instanceof Error ? e.message : 'desconocido'}`);
    }
  };

  const notConfigured = OFFLINE_REGION_CATALOG.length === 0 || !OFFLINE_ASSETS_PACK_URL;

  // ---- datos derivados para la lista ---------------------------------------
  const anchor = searchedPoint ?? myLoc;
  const sorted = useMemo(() => {
    if (!anchor) return OFFLINE_REGION_CATALOG;
    return [...OFFLINE_REGION_CATALOG].sort((a, b) => {
      const [ax, ay] = regionCenter(a.bbox); const [bx, by] = regionCenter(b.bbox);
      return haversineKm(anchor.lng, anchor.lat, ax, ay) - haversineKm(anchor.lng, anchor.lat, bx, by);
    });
  }, [anchor?.lng, anchor?.lat]);
  const suggested = anchor ? sorted.slice(0, 3) : [];
  const rest = anchor ? sorted.slice(3) : OFFLINE_REGION_CATALOG;

  const regionsFC = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: OFFLINE_REGION_CATALOG.map((it) => {
      const [w, s, e, n] = it.bbox;
      return {
        type: 'Feature' as const,
        properties: { id: it.id, dl: isDownloaded(it.id), sel: it.id === selectedId },
        geometry: { type: 'Polygon' as const, coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] },
      };
    }),
  }), [downloaded, selectedId]);

  const unionCenter = regionCenter(unionBbox(OFFLINE_REGION_CATALOG));
  const selectedItem = selectedId ? OFFLINE_REGION_CATALOG.find((c) => c.id === selectedId) ?? null : null;
  const selectedDownloaded = selectedItem ? downloaded.find((r) => r.id === selectedItem.id) ?? null : null;

  // ---- fila de región (selector) -------------------------------------------
  const RegionRow = (item: OfflineRegionCatalogItem) => {
    const dl = isDownloaded(item.id);
    const sel = item.id === selectedId;
    const km = anchor ? haversineKm(anchor.lng, anchor.lat, ...regionCenter(item.bbox)) : null;
    return (
      <TouchableOpacity
        key={item.id} activeOpacity={0.8} onPress={() => selectRegion(item.id)}
        style={{
          backgroundColor: sel ? colors.accentSoft : colors.bgCard, borderRadius: 12, padding: 12,
          flexDirection: 'row', alignItems: 'center', gap: 10,
          borderWidth: 1, borderColor: sel ? colors.accent : dl ? colors.success + '50' : colors.border,
        }}
      >
        <Ionicons name={dl ? 'cloud-done' : 'map-outline'} size={20} color={dl ? colors.success : colors.accent} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>{item.name}</Text>
          {!!item.blurb && <Text style={{ color: colors.textMuted, fontSize: 11 }} numberOfLines={1}>{item.blurb}</Text>}
          <Text style={{ color: dl ? colors.success : colors.textSecondary, fontSize: 11, marginTop: 1 }}>
            {dl ? 'Descargada' : `≈ ${fmtSize(item.sizeBytes)}`}{km != null ? ` · ${fmtKm(km)}` : ''}
          </Text>
        </View>
        <Ionicons name={sel ? 'chevron-up' : 'chevron-forward'} size={18} color={colors.textMuted} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Header */}
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '800', flex: 1 }}>Mapas sin conexión</Text>
        <TouchableOpacity onPress={handleDiag} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
          <Ionicons name="bug-outline" size={20} color={colors.accent} />
        </TouchableOpacity>
      </View>

      {/* Buscador (zIndex alto para que el desplegable tape el mapa) */}
      <View style={{ paddingHorizontal: 16, zIndex: 30 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.bgInput, borderRadius: 12, paddingHorizontal: 12, height: 46, borderWidth: 1, borderColor: colors.border }}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={doSearch}
            returnKeyType="search"
            placeholder="Busca un lugar: Machu Picchu, Colca…"
            placeholderTextColor={colors.textMuted}
            style={{ flex: 1, color: colors.textPrimary, fontSize: 14, paddingVertical: 0 }}
          />
          {searching ? <ActivityIndicator size="small" color={colors.accent} />
            : query.length > 0 ? (
              <TouchableOpacity onPress={clearSearch} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            ) : null}
        </View>

        {/* Desplegable de resultados */}
        {results.length > 0 && (
          <View style={{ position: 'absolute', top: 50, left: 16, right: 16, backgroundColor: colors.bgElevated, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', zIndex: 40 }}>
            {results.map((r, i) => (
              <TouchableOpacity key={`${r.lat},${r.lng},${i}`} onPress={() => applyResult(r)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 11, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}>
                <Ionicons name="location-outline" size={16} color={colors.accent} />
                <Text style={{ color: colors.textSecondary, fontSize: 12, flex: 1 }} numberOfLines={2}>{r.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {searchErr && results.length === 0 && (
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 6, marginLeft: 4 }}>{searchErr}</Text>
        )}
      </View>

      {/* Mapa de previsualización */}
      <View style={{ height: mapH, marginHorizontal: 16, marginTop: 10, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
        <MapView
          style={{ flex: 1 }}
          logoEnabled={false}
          attributionEnabled={false}
          onDidFinishLoadingMap={() => setMapReady(true)}
        >
          <Camera ref={cameraRef} defaultSettings={{ centerCoordinate: unionCenter, zoomLevel: 4.6 }} />
          <RasterSource id="off-tiles" tileUrlTemplates={thunderforestTileUrls()} tileSize={256} maxZoomLevel={18} minZoomLevel={1}>
            <RasterLayer id="off-tile-layer" sourceID="off-tiles" style={{ rasterOpacity: 1 }} />
          </RasterSource>

          {/* Recuadros de regiones (toca para seleccionar) */}
          <ShapeSource id="off-regions" shape={regionsFC} onPress={(e: any) => {
            const id = e?.features?.[0]?.properties?.id;
            if (id) selectRegion(id);
          }}>
            <FillLayer id="off-regions-fill" style={{
              fillColor: ['case', ['get', 'sel'], colors.accent, ['get', 'dl'], colors.success, colors.accent] as any,
              fillOpacity: ['case', ['get', 'sel'], 0.32, ['get', 'dl'], 0.18, 0.10] as any,
            }} />
            <LineLayer id="off-regions-line" style={{
              lineColor: ['case', ['get', 'dl'], colors.success, colors.accent] as any,
              lineWidth: ['case', ['get', 'sel'], 3, 1.5] as any,
              lineOpacity: 0.9,
            }} />
          </ShapeSource>

          {/* Mi ubicación */}
          {myLoc && (
            <ShapeSource id="off-me" shape={{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [myLoc.lng, myLoc.lat] } } as any}>
              <CircleLayer id="off-me-dot" style={{ circleRadius: 6, circleColor: '#3B82F6', circleStrokeColor: '#fff', circleStrokeWidth: 2 }} />
            </ShapeSource>
          )}

          {/* Pin del lugar buscado */}
          {searchedPoint && (
            <MarkerView coordinate={[searchedPoint.lng, searchedPoint.lat]} anchor={{ x: 0.5, y: 1 }}>
              <View pointerEvents="none" style={{ alignItems: 'center' }}>
                <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.accent, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="flag" size={13} color="#0D1B12" />
                </View>
                <View style={{ width: 0, height: 0, borderLeftWidth: 4, borderRightWidth: 4, borderTopWidth: 7, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#fff', marginTop: -1 }} />
              </View>
            </MarkerView>
          )}
        </MapView>

        <MissingTileKeyBanner />
        {!online && (
          <View style={{ position: 'absolute', bottom: 8, left: 8, right: 8, backgroundColor: '#0D1B12CC', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="cloud-offline-outline" size={14} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, fontSize: 11, flex: 1 }}>Sin conexión: el mapa base y la búsqueda necesitan internet. Lo descargado sigue disponible.</Text>
          </View>
        )}
      </View>

      {/* CTA de la región seleccionada */}
      <View style={{ paddingHorizontal: 16, marginTop: 10 }}>
        {selectedItem ? (
          <View style={{ backgroundColor: colors.bgCard, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.accent + '70', gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name={selectedDownloaded ? 'cloud-done' : 'cloud-download-outline'} size={20} color={selectedDownloaded ? colors.success : colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '800' }} numberOfLines={1}>{selectedItem.name}</Text>
                {!!selectedItem.blurb && <Text style={{ color: colors.textMuted, fontSize: 11 }} numberOfLines={1}>{selectedItem.blurb}</Text>}
              </View>
              {selectedDownloaded ? (
                <TouchableOpacity onPress={() => handleDelete(selectedDownloaded)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.danger + '22', paddingHorizontal: 14, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.danger + '55' }}>
                  <Ionicons name="trash-outline" size={16} color={colors.danger} />
                  <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '700' }}>Borrar</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={() => handleDownload(selectedItem)} disabled={!!downloadingId}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accent, paddingHorizontal: 16, height: 40, borderRadius: 20, opacity: downloadingId && downloadingId !== selectedItem.id ? 0.5 : 1 }}>
                  {downloadingId === selectedItem.id ? <ActivityIndicator color="#0D1B12" size="small" /> : <Ionicons name="download" size={16} color="#0D1B12" />}
                  <Text style={{ color: '#0D1B12', fontSize: 13, fontWeight: '800' }}>
                    {downloadingId === selectedItem.id ? (preparing ? `Fuentes ${Math.round(progress)}%` : `${Math.round(progress)}%`) : `Descargar · ${fmtSize(selectedItem.sizeBytes)}`}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            {searchInfo?.coveredId === selectedItem.id && searchedPoint && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                <Text style={{ color: colors.success, fontSize: 11, flex: 1 }}>Cubre «{searchInfo.label}»</Text>
              </View>
            )}
          </View>
        ) : (
          <View style={{ backgroundColor: colors.bgCard, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="hand-left-outline" size={18} color={colors.accent} />
            <Text style={{ color: colors.textMuted, fontSize: 12, flex: 1 }}>Busca un lugar arriba o toca una zona en el mapa para descargarla.</Text>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 24, gap: 12 }} keyboardShouldPersistTaps="handled">
        {/* Aviso: el lugar buscado no está cubierto */}
        {searchInfo && !searchInfo.coveredId && (
          <View style={{ backgroundColor: colors.accentSoft, borderRadius: 12, padding: 12, gap: 8, borderWidth: 1, borderColor: colors.accent + '50' }}>
            <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }}>
              Todavía no hay un mapa offline que cubra «{searchInfo.label}».
              {searchInfo.nearestId ? ` La zona más cercana es «${OFFLINE_REGION_CATALOG.find((c) => c.id === searchInfo.nearestId)?.name}» (${fmtKm(searchInfo.km)}).` : ''}
            </Text>
            {searchInfo.nearestId && (
              <TouchableOpacity onPress={() => selectRegion(searchInfo.nearestId!)} style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.bgElevated, paddingHorizontal: 12, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.border }}>
                <Ionicons name="navigate-outline" size={14} color={colors.accent} />
                <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: '700' }}>Ver la más cercana</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Estado del pack de fuentes */}
        {!notConfigured && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.bgCard, borderRadius: 12, padding: 11, borderWidth: 1, borderColor: colors.border }}>
            {repairing
              ? <ActivityIndicator size="small" color={colors.accent} />
              : <Ionicons name={assetsReady ? 'text' : 'text-outline'} size={16} color={assetsReady ? colors.success : colors.textMuted} />}
            <Text style={{ color: colors.textSecondary, fontSize: 11, flex: 1 }}>
              {repairing
                ? 'Actualizando fuentes del mapa…'
                : assetsReady ? 'Fuentes y símbolos listos (etiquetas offline).' : 'Las fuentes se descargan junto con tu primera zona.'}
            </Text>
          </View>
        )}

        {/* Configuración pendiente */}
        {notConfigured && (
          <View style={{ backgroundColor: colors.accentSoft, borderRadius: 12, padding: 14, gap: 6, borderWidth: 1, borderColor: colors.accent + '60' }}>
            <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '700' }}>Configuración pendiente</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }}>Aún no hay regiones publicadas en el catálogo.</Text>
          </View>
        )}

        {/* Sugeridas cerca de ti */}
        {suggested.length > 0 && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <Ionicons name={searchedPoint ? 'flag-outline' : 'locate-outline'} size={14} color={colors.accent} />
              <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '800' }}>
                {searchedPoint ? `Cerca de «${searchedPoint.label}»` : 'Sugeridas cerca de ti'}
              </Text>
            </View>
            {suggested.map(RegionRow)}
          </>
        )}

        {/* Resto / todas */}
        {rest.length > 0 && (
          <>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', marginTop: 6 }}>
              {suggested.length > 0 ? 'Más regiones' : 'Regiones disponibles'}
            </Text>
            {rest.map(RegionRow)}
          </>
        )}

        {/* Descargadas que ya no están en el catálogo */}
        {downloaded.filter((r) => !OFFLINE_REGION_CATALOG.some((c) => c.id === r.id)).map((region) => (
          <View key={region.id} style={{ backgroundColor: colors.bgCard, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.border }}>
            <Ionicons name="cloud-done" size={20} color={colors.success} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>{region.name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>Descargada · {fmtSize(region.bytes)}</Text>
            </View>
            <TouchableOpacity onPress={() => handleDelete(region)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            </TouchableOpacity>
          </View>
        ))}

        {/* Explicación al pie */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 4, paddingHorizontal: 4 }}>
          <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} style={{ marginTop: 1 }} />
          <Text style={{ color: colors.textMuted, fontSize: 11, lineHeight: 16, flex: 1 }}>
            Descarga tu zona con wifi antes de salir. En la montaña, al perder señal, la app usa automáticamente el mapa descargado. Mapas © OpenStreetMap.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
