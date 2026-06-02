import { useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  MapView, Camera, RasterSource, RasterLayer,
  setAccessToken, Logger,
} from '@maplibre/maplibre-react-native';
import { thunderforestTileUrls } from '@infrastructure/config/env';
import MissingTileKeyBanner from './MissingTileKeyBanner';
import { colors } from '@presentation/theme/colors';

if (typeof setAccessToken === 'function') setAccessToken(null);
Logger.setLogCallback((log) => {
  if (log.message?.includes('Failed to load tile')) return true;
  if (log.message?.includes('permanent error: Canceled')) return true;
  return false;
});

interface Props {
  visible: boolean;
  /** Centro inicial del mapa. */
  initial: { lat: number; lon: number };
  title?: string;
  onConfirm: (coords: { lat: number; lon: number }) => void;
  onClose: () => void;
}

/**
 * Selector de ubicación con patrón "crosshair central": el mapa se desplaza
 * bajo un pin fijo en el centro y al confirmar se lee la coordenada central.
 * Más fiable en Android que el pin arrastrable de MapLibre.
 */
export default function LocationPickerModal({ visible, initial, title = 'Ajustar ubicación', onConfirm, onClose }: Props) {
  const insets = useSafeAreaInsets();
  // Centro vigente del mapa (se actualiza al mover). Ref para no re-renderizar
  // en cada frame; el texto de coords se refresca con un pequeño estado.
  const centerRef = useRef<{ lat: number; lon: number }>(initial);
  const [coordLabel, setCoordLabel] = useState(`${initial.lat.toFixed(5)}, ${initial.lon.toFixed(5)}`);

  const validInitial =
    Number.isFinite(initial.lat) && Number.isFinite(initial.lon) && !(initial.lat === 0 && initial.lon === 0);
  const startCenter: [number, number] = validInitial ? [initial.lon, initial.lat] : [-75.0152, -9.19];

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <MapView
          style={StyleSheet.absoluteFill}
          logoEnabled={false}
          attributionEnabled={false}
          rotateEnabled={false}
          onRegionDidChange={(feature: any) => {
            const c = feature?.geometry?.coordinates;
            if (Array.isArray(c) && c.length >= 2) {
              centerRef.current = { lon: c[0], lat: c[1] };
              setCoordLabel(`${c[1].toFixed(5)}, ${c[0].toFixed(5)}`);
            }
          }}
        >
          <RasterSource
            id="picker-tiles"
            tileUrlTemplates={thunderforestTileUrls()}
            tileSize={256}
            maxZoomLevel={18}
            minZoomLevel={1}
          >
            <RasterLayer id="picker-tile-layer" sourceID="picker-tiles" style={{ rasterOpacity: 1 }} />
          </RasterSource>
          <Camera defaultSettings={{ centerCoordinate: startCenter, zoomLevel: validInitial ? 16 : 12 }} />
        </MapView>

        {/* Crosshair fijo en el centro (la punta inferior marca la coordenada) */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            {/* desplazamos hacia arriba media altura del pin para que la punta
                quede justo en el centro geométrico */}
            <View style={{ alignItems: 'center', marginTop: -34 }}>
              <View style={{
                width: 34, height: 34, borderRadius: 17,
                backgroundColor: colors.accent, borderWidth: 3, borderColor: '#fff',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name="location" size={18} color="#0D1B12" />
              </View>
              <View style={{
                width: 0, height: 0,
                borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 9,
                borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#fff',
                marginTop: -1,
              }} />
              {/* Punto de anclaje en el suelo */}
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#0D1B12', marginTop: 1 }} />
            </View>
          </View>
        </View>

        <MissingTileKeyBanner />

        {/* Header */}
        <View style={{
          position: 'absolute', top: insets.top + 12, left: 16, right: 16,
          flexDirection: 'row', alignItems: 'center', gap: 12,
        }}>
          <TouchableOpacity
            onPress={onClose}
            style={{
              width: 40, height: 40, borderRadius: 20, backgroundColor: '#0D1B12CC',
              alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#2D6A4F80',
            }}
          >
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{
            flex: 1, backgroundColor: '#0D1B12CC', borderRadius: 12,
            paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#2D6A4F80',
          }}>
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>{title}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 1 }}>
              Arrastra el mapa para colocar el punto
            </Text>
          </View>
        </View>

        {/* Confirmar */}
        <View style={{
          position: 'absolute', bottom: insets.bottom + 24, left: 16, right: 16, gap: 10,
        }}>
          <View style={{
            backgroundColor: '#0D1B12CC', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
            borderWidth: 1, borderColor: '#2D6A4F80', flexDirection: 'row', alignItems: 'center', gap: 8,
          }}>
            <Ionicons name="pin-outline" size={16} color={colors.accent} />
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{coordLabel}</Text>
          </View>
          <TouchableOpacity
            onPress={() => onConfirm(centerRef.current)}
            style={{
              backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 16,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
            }}
          >
            <Ionicons name="checkmark" size={20} color="#0D1B12" />
            <Text style={{ color: '#0D1B12', fontSize: 16, fontWeight: '700' }}>Usar esta ubicación</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
