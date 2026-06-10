import { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView, StatusBar, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  listDownloadedRegions, deleteRegion, downloadRegion, ensureAssetsPack, isAssetsReady,
  getOfflineDiagnostics,
  type DownloadedRegion,
} from '@infrastructure/services/OfflineMapsService';
import { OFFLINE_REGION_CATALOG, OFFLINE_ASSETS_PACK_URL } from '@shared/constants/offlineRegions';
import { useUiStore } from '@presentation/stores/uiStore';
import { colors } from '@presentation/theme/colors';

const fmtSize = (bytes: number) => bytes >= 1e6 ? `${(bytes / 1e6).toFixed(0)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`;

export default function MapOfflineScreen() {
  const insets = useSafeAreaInsets();
  const { showToast } = useUiStore();

  const [downloaded, setDownloaded] = useState<DownloadedRegion[]>([]);
  const [assetsReady, setAssetsReady] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [preparing, setPreparing] = useState(false);

  const refresh = useCallback(() => {
    listDownloadedRegions().then(setDownloaded).catch(() => {});
    isAssetsReady().then(setAssetsReady).catch(() => {});
  }, []);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const isDownloaded = (id: string) => downloaded.some((r) => r.id === id);

  const handleDownload = async (item: typeof OFFLINE_REGION_CATALOG[number]) => {
    if (downloadingId) return;
    setDownloadingId(item.id);
    setProgress(0);
    setPreparing(false);
    let inAssets = false;
    try {
      await downloadRegion(item, (pct) => setProgress(pct));
      // Fuentes/sprite (una sola vez). Se asegura aquí —no dentro de
      // downloadRegion— para mostrar su progreso y no ocultar un fallo: sin el
      // pack el mapa offline saldría sin etiquetas.
      inAssets = true;
      setPreparing(true);
      await ensureAssetsPack((pct) => setProgress(pct));
      showToast('Zona descargada para usar sin conexión.', 'success');
      refresh();
    } catch (e) {
      // La región pudo quedar descargada aunque fallaran las fuentes: refresca
      // igual para que aparezca en la lista, pero avisa del fallo real.
      refresh();
      const msg = e instanceof Error ? e.message : 'error';
      showToast(
        inAssets
          ? `Zona descargada, pero faltan las fuentes (mapa sin etiquetas): ${msg}`
          : `No se pudo descargar la zona: ${msg}`,
        'error',
      );
    } finally {
      setDownloadingId(null);
      setPreparing(false);
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
      Alert.alert('Diagnóstico offline', txt, [{ text: 'OK' }]);
    } catch (e) {
      Alert.alert('Diagnóstico offline', `Error: ${e instanceof Error ? e.message : 'desconocido'}`);
    }
  };

  const notConfigured = OFFLINE_REGION_CATALOG.length === 0 || !OFFLINE_ASSETS_PACK_URL;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Header */}
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '800', flex: 1 }}>Mapas sin conexión</Text>
        <TouchableOpacity onPress={handleDiag} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
          <Ionicons name="bug-outline" size={20} color={colors.accent} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24, gap: 14 }}>
        {/* Explicación */}
        <View style={{ backgroundColor: colors.bgCard, borderRadius: 12, padding: 14, gap: 6, borderWidth: 1, borderColor: colors.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="cloud-offline-outline" size={18} color={colors.accent} />
            <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '700' }}>Descarga tu zona antes de ir</Text>
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 17 }}>
            Guarda el mapa de una región para verlo en la montaña sin señal. Al perder la conexión, la app usa automáticamente el mapa descargado.
          </Text>
        </View>

        {/* Estado del pack de fuentes */}
        {!notConfigured && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.bgCard, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border }}>
            <Ionicons name={assetsReady ? 'text' : 'text-outline'} size={18} color={assetsReady ? colors.success : colors.textMuted} />
            <Text style={{ color: colors.textSecondary, fontSize: 12, flex: 1 }}>
              {assetsReady ? 'Fuentes y símbolos listos (etiquetas offline).' : 'Las fuentes se descargan con tu primera zona.'}
            </Text>
          </View>
        )}

        {/* Aviso de configuración pendiente */}
        {notConfigured && (
          <View style={{ backgroundColor: colors.accentSoft, borderRadius: 12, padding: 14, gap: 6, borderWidth: 1, borderColor: colors.accent + '60' }}>
            <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '700' }}>Configuración pendiente</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }}>
              Aún no hay regiones publicadas. Genera el `.pmtiles` de tu zona en app.protomaps.com, súbelo (con el pack de fuentes) a Supabase Storage y regístralo en `src/shared/constants/offlineRegions.ts`.
            </Text>
          </View>
        )}

        {/* Catálogo de regiones */}
        {OFFLINE_REGION_CATALOG.map((item) => {
          const dl = isDownloaded(item.id);
          const busy = downloadingId === item.id;
          const region = downloaded.find((r) => r.id === item.id);
          return (
            <View key={item.id} style={{ backgroundColor: colors.bgCard, borderRadius: 12, padding: 14, gap: 12, borderWidth: 1, borderColor: dl ? colors.success + '50' : colors.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name={dl ? 'cloud-done-outline' : 'map-outline'} size={20} color={dl ? colors.success : colors.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '700' }} numberOfLines={1}>{item.name}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    {dl && region ? `Descargada · ${fmtSize(region.bytes)}` : `≈ ${fmtSize(item.sizeBytes)}`}
                  </Text>
                </View>
                {dl && region ? (
                  <TouchableOpacity onPress={() => handleDelete(region)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="trash-outline" size={20} color={colors.danger} />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={() => handleDownload(item)} disabled={!!downloadingId}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accent, paddingHorizontal: 14, height: 38, borderRadius: 19, opacity: downloadingId && !busy ? 0.5 : 1 }}>
                    {busy ? <ActivityIndicator color="#0D1B12" size="small" /> : <Ionicons name="download" size={16} color="#0D1B12" />}
                    <Text style={{ color: '#0D1B12', fontSize: 13, fontWeight: '700' }}>{busy ? (preparing ? `Fuentes ${Math.round(progress)}%` : `${Math.round(progress)}%`) : 'Descargar'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}

        {/* Regiones descargadas que ya no están en el catálogo */}
        {downloaded.filter((r) => !OFFLINE_REGION_CATALOG.some((c) => c.id === r.id)).map((region) => (
          <View key={region.id} style={{ backgroundColor: colors.bgCard, borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.border }}>
            <Ionicons name="cloud-done-outline" size={20} color={colors.success} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '700' }} numberOfLines={1}>{region.name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>Descargada · {fmtSize(region.bytes)}</Text>
            </View>
            <TouchableOpacity onPress={() => handleDelete(region)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
