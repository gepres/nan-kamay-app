import { useState } from 'react';
import {
  View, Image, ScrollView, TouchableOpacity, Text, ActivityIndicator,
  type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library';
import { downloadAsync, cacheDirectory } from 'expo-file-system/legacy';
import { useUiStore } from '@presentation/stores/uiStore';
import { colors } from '@presentation/theme/colors';

const AnimatedImage = Animated.createAnimatedComponent(Image);

interface Props {
  uris: string[];
  width: number;
  height: number;
  /** Estilo animado (Ken Burns) — solo se aplica cuando hay una sola foto. */
  animatedStyle?: any;
}

/**
 * Carrusel de fotos de waypoint con UX móvil:
 * - 1 foto → imagen única (con Ken Burns si se pasa `animatedStyle`).
 * - >1 foto → carrusel deslizable (paging) con dots + contador.
 * - Botón de descarga a la galería del usuario (pide permiso; descarga
 *   primero si la URI es remota de Supabase Storage).
 */
export default function WaypointPhotoCarousel({ uris, width, height, animatedStyle }: Props) {
  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const { showToast } = useUiStore();
  const multi = uris.length > 1;

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) setIndex(i);
  };

  const handleDownload = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) {
        showToast('Permiso de galería denegado.', 'error');
        return;
      }
      const uri = uris[index];
      let localUri = uri;
      if (uri.startsWith('http')) {
        const dest = `${cacheDirectory ?? ''}wp_${index}_${Date.now()}.jpg`;
        const res = await downloadAsync(uri, dest);
        localUri = res.uri;
      }
      await MediaLibrary.saveToLibraryAsync(localUri);
      showToast('Foto guardada en tu galería.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo guardar la foto.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ width, height, backgroundColor: '#000', overflow: 'hidden' }}>
      {multi ? (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScrollEnd}
        >
          {uris.map((u, i) => (
            <Image key={i} source={{ uri: u }} style={{ width, height }} resizeMode="cover" />
          ))}
        </ScrollView>
      ) : animatedStyle ? (
        <AnimatedImage source={{ uri: uris[0] }} style={[{ width, height }, animatedStyle]} resizeMode="cover" />
      ) : (
        <Image source={{ uri: uris[0] }} style={{ width, height }} resizeMode="cover" />
      )}

      {/* Contador (solo multi) */}
      {multi && (
        <View style={{
          position: 'absolute', top: 10, left: 10,
          backgroundColor: '#0D1B12CC', borderRadius: 12,
          paddingHorizontal: 8, paddingVertical: 3,
        }}>
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}>
            {index + 1}/{uris.length}
          </Text>
        </View>
      )}

      {/* Botón descargar a galería */}
      <TouchableOpacity
        onPress={handleDownload}
        disabled={saving}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={{
          position: 'absolute', top: 10, right: 10,
          width: 38, height: 38, borderRadius: 19,
          backgroundColor: '#0D1B12CC',
          borderWidth: 1, borderColor: '#FFFFFF20',
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        {saving ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Ionicons name="download-outline" size={20} color="#fff" />
        )}
      </TouchableOpacity>

      {/* Dots de paginación */}
      {multi && (
        <View style={{
          position: 'absolute', bottom: 10, left: 0, right: 0,
          flexDirection: 'row', justifyContent: 'center', gap: 6,
        }}>
          {uris.map((_, i) => (
            <View key={i} style={{
              width: i === index ? 18 : 6, height: 6, borderRadius: 3,
              backgroundColor: i === index ? colors.accent : '#FFFFFF66',
            }} />
          ))}
        </View>
      )}
    </View>
  );
}
