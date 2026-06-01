import { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { exportRouteUseCase } from '@application/export/ExportRouteUseCase';
import { ExportFormat } from '@core/ports/services/IExportService';
import { useUiStore } from '@presentation/stores/uiStore';
import { colors } from '@presentation/theme/colors';

interface Props {
  routeId: string;
}

const FORMATS: { format: ExportFormat; label: string; desc: string }[] = [
  { format: 'gpx', label: 'GPX', desc: 'Garmin, Strava, Wikiloc' },
  { format: 'kml', label: 'KML', desc: 'Google Earth, Maps' },
  { format: 'kmz', label: 'KMZ', desc: 'KML + imágenes' },
];

/** Metadatos del share sheet por formato. */
const SHARE_META: Record<ExportFormat, { mimeType: string; uti: string; dialog: string }> = {
  gpx: { mimeType: 'application/gpx+xml', uti: 'public.xml', dialog: 'Exportar ruta (GPX)' },
  kml: { mimeType: 'application/vnd.google-earth.kml+xml', uti: 'public.xml', dialog: 'Exportar ruta (KML)' },
  kmz: { mimeType: 'application/vnd.google-earth.kmz', uti: 'public.zip', dialog: 'Exportar ruta (KMZ)' },
  csv: { mimeType: 'text/csv', uti: 'public.comma-separated-values-text', dialog: 'Diagnóstico de grabación (CSV)' },
};

export default function ExportButtons({ routeId }: Props) {
  const [loadingFormat, setLoadingFormat] = useState<ExportFormat | null>(null);
  const { showToast } = useUiStore();

  const handleExport = async (format: ExportFormat) => {
    setLoadingFormat(format);
    try {
      const uri = await exportRouteUseCase({ routeId, format });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        const meta = SHARE_META[format];
        await Sharing.shareAsync(uri, {
          mimeType: meta.mimeType,
          dialogTitle: meta.dialog,
          UTI: meta.uti,
        });
      } else {
        showToast('Compartir no está disponible en este dispositivo.', 'error');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al exportar.';
      showToast(msg, 'error');
    } finally {
      setLoadingFormat(null);
    }
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Ionicons name="share-outline" size={18} color={colors.accent} />
        <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600' }}>Exportar ruta</Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        {FORMATS.map(({ format, label, desc }) => {
          const isLoading = loadingFormat === format;
          return (
            <TouchableOpacity
              key={format}
              onPress={() => handleExport(format)}
              disabled={loadingFormat !== null}
              style={{
                flex: 1,
                backgroundColor: colors.bgCard,
                borderRadius: 10,
                padding: 12,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: isLoading ? colors.accent : '#2D6A4F',
                gap: 4,
              }}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Text style={{ color: colors.accent, fontSize: 15, fontWeight: '700' }}>
                  {label}
                </Text>
              )}
              <Text style={{ color: colors.textMuted, fontSize: 10, textAlign: 'center' }}>
                {desc}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Diagnóstico de grabación: puntos crudos para depurar el GPS (no es un
          formato de usuario final; útil en pruebas de campo). */}
      <TouchableOpacity
        onPress={() => handleExport('csv')}
        disabled={loadingFormat !== null}
        style={{
          marginTop: 12,
          backgroundColor: colors.bgPrimary,
          borderRadius: 10,
          paddingVertical: 11,
          paddingHorizontal: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          borderWidth: 1,
          borderColor: '#2D6A4F',
          borderStyle: 'dashed',
        }}
      >
        {loadingFormat === 'csv' ? (
          <ActivityIndicator size="small" color={colors.textSecondary} />
        ) : (
          <Ionicons name="bug-outline" size={17} color={colors.textSecondary} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>
            Diagnóstico (CSV)
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 1 }}>
            Puntos crudos con precisión, tiempos y velocidad — para depurar la grabación
          </Text>
        </View>
        <Ionicons name="download-outline" size={16} color={colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}
