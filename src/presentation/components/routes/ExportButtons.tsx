import { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator, Share } from 'react-native';
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

export default function ExportButtons({ routeId }: Props) {
  const [loadingFormat, setLoadingFormat] = useState<ExportFormat | null>(null);
  const { showToast } = useUiStore();

  const handleExport = async (format: ExportFormat) => {
    setLoadingFormat(format);
    try {
      const uri = await exportRouteUseCase({ routeId, format });

      // Compartir el archivo usando el Share API nativo
      await Share.share({
        url: uri,          // iOS
        message: uri,      // Android fallback
        title: `Ruta exportada (${format.toUpperCase()})`,
      });
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
    </View>
  );
}
