import { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, Image, Modal, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { downloadAsync, cacheDirectory } from 'expo-file-system/legacy';
import { WaypointMedia } from '@core/entities/Waypoint';
import { useUiStore } from '@presentation/stores/uiStore';
import { colors } from '@presentation/theme/colors';

/**
 * Hook para guardar un media en la galería del teléfono.
 * - Si la URI es remota (Supabase Storage) la descarga primero a caché.
 * - Video → galería. Audio → galería en Android; en iOS la galería de fotos no
 *   acepta audio, así que cae al menú de compartir (guardar en Archivos, etc.).
 */
function useMediaSaver() {
  const [saving, setSaving] = useState(false);
  const { showToast } = useUiStore();

  const save = useCallback(async (uri: string, ext: string, label: string) => {
    if (saving) return;
    setSaving(true);
    try {
      let localUri = uri;
      if (uri.startsWith('http')) {
        const dest = `${cacheDirectory ?? ''}wp_${Date.now()}.${ext}`;
        localUri = (await downloadAsync(uri, dest)).uri;
      }

      let savedToGallery = false;
      try {
        const perm = await MediaLibrary.requestPermissionsAsync();
        if (perm.granted) {
          await MediaLibrary.saveToLibraryAsync(localUri);
          savedToGallery = true;
        }
      } catch {
        /* p. ej. audio en iOS: la galería no acepta audio → compartir abajo */
      }

      if (savedToGallery) {
        showToast(`${label} guardado en tu galería.`, 'success');
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(localUri);
      } else {
        showToast('No se pudo guardar.', 'error');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo guardar.', 'error');
    } finally {
      setSaving(false);
    }
  }, [saving, showToast]);

  return { saving, save };
}

/** Botón circular de descarga (muestra spinner mientras guarda). */
function DownloadButton({
  onPress, saving, size = 30, iconSize = 16,
}: {
  onPress: () => void;
  saving: boolean;
  size?: number;
  iconSize?: number;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={saving}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: '#0D1B12CC',
        borderWidth: 1, borderColor: '#FFFFFF20',
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      {saving ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <Ionicons name="download-outline" size={iconSize} color="#fff" />
      )}
    </TouchableOpacity>
  );
}

/** Reproductor de video en modal a pantalla completa. */
function VideoPlayerModal({ uri, onClose }: { uri: string; onClose: () => void }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.play();
  });
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <VideoView style={StyleSheet.absoluteFill} player={player} contentFit="contain" />
      <TouchableOpacity
        onPress={onClose}
        style={{
          position: 'absolute', top: 48, right: 20,
          width: 44, height: 44, borderRadius: 22,
          backgroundColor: '#0D1B12CC', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Ionicons name="close" size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

/** Miniatura de video que abre el reproductor al tocar + botón de descarga. */
function VideoThumb({ media }: { media: WaypointMedia }) {
  const [open, setOpen] = useState(false);
  const { saving, save } = useMediaSaver();
  return (
    <>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setOpen(true)}
        style={{
          width: 96, height: 96, borderRadius: 10, overflow: 'hidden',
          backgroundColor: '#000', alignItems: 'center', justifyContent: 'center',
          borderWidth: 1, borderColor: colors.border,
        }}
      >
        {media.thumbnailUri ? (
          <Image source={{ uri: media.thumbnailUri }} style={{ width: '100%', height: '100%' }} />
        ) : (
          <Ionicons name="videocam" size={24} color={colors.textMuted} />
        )}
        <View style={{ position: 'absolute' }}>
          <Ionicons name="play-circle" size={32} color="#FFFFFFDD" />
        </View>
        {media.durationMs ? (
          <View style={{ position: 'absolute', bottom: 4, left: 4, backgroundColor: '#0D1B12CC', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 }}>
            <Text style={{ color: '#fff', fontSize: 10 }}>{Math.round(media.durationMs / 1000)}s</Text>
          </View>
        ) : null}
        {/* Descargar a galería (esquina superior derecha) */}
        <View style={{ position: 'absolute', top: 4, right: 4 }}>
          <DownloadButton onPress={() => save(media.uri, 'mp4', 'Video')} saving={saving} size={28} iconSize={15} />
        </View>
      </TouchableOpacity>
      <Modal visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <VideoPlayerModal uri={media.uri} onClose={() => setOpen(false)} />
      </Modal>
    </>
  );
}

/** Fila de nota de voz con play/pausa + botón de descarga. */
function AudioRow({ media, index }: { media: WaypointMedia; index: number }) {
  const player = useAudioPlayer(media.uri);
  const status = useAudioPlayerStatus(player);
  const playing = status.playing;
  const { saving, save } = useMediaSaver();

  const toggle = () => {
    if (playing) {
      player.pause();
    } else {
      if (status.didJustFinish || (status.currentTime ?? 0) >= (status.duration ?? 0)) {
        player.seekTo(0);
      }
      player.play();
    }
  };

  const dur = media.durationMs ? Math.round(media.durationMs / 1000) : Math.round(status.duration ?? 0);

  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: colors.bgCard, borderRadius: 10, padding: 12,
      borderWidth: 1, borderColor: colors.border,
    }}>
      <TouchableOpacity
        onPress={toggle}
        style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}
      >
        <Ionicons name={playing ? 'pause' : 'play'} size={18} color="#0D1B12" style={{ marginLeft: playing ? 0 : 2 }} />
      </TouchableOpacity>
      <Ionicons name="mic" size={16} color={colors.accent} />
      <Text style={{ color: colors.textPrimary, fontSize: 14, flex: 1 }}>
        Nota {index + 1}{dur ? ` · ${dur}s` : ''}
      </Text>
      {/* Descargar a galería / compartir */}
      <DownloadButton onPress={() => save(media.uri, 'm4a', 'Nota de voz')} saving={saving} size={34} iconSize={17} />
    </View>
  );
}

/** Sección de videos + notas de voz de un waypoint (las fotos van aparte). */
export default function WaypointMediaSection({ media }: { media: WaypointMedia[] }) {
  const videos = media.filter((m) => m.type === 'video');
  const audios = media.filter((m) => m.type === 'audio');
  if (videos.length === 0 && audios.length === 0) return null;

  return (
    <View style={{ gap: 10 }}>
      {videos.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {videos.map((m) => <VideoThumb key={m.uri} media={m} />)}
        </View>
      )}
      {audios.map((m, i) => <AudioRow key={m.uri} media={m} index={i} />)}
    </View>
  );
}
