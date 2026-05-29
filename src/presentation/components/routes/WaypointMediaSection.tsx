import { useState } from 'react';
import { View, Text, TouchableOpacity, Image, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { WaypointMedia } from '@core/entities/Waypoint';
import { colors } from '@presentation/theme/colors';

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

/** Miniatura de video que abre el reproductor al tocar. */
function VideoThumb({ media }: { media: WaypointMedia }) {
  const [open, setOpen] = useState(false);
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
          <View style={{ position: 'absolute', bottom: 4, right: 4, backgroundColor: '#0D1B12CC', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 }}>
            <Text style={{ color: '#fff', fontSize: 10 }}>{Math.round(media.durationMs / 1000)}s</Text>
          </View>
        ) : null}
      </TouchableOpacity>
      <Modal visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <VideoPlayerModal uri={media.uri} onClose={() => setOpen(false)} />
      </Modal>
    </>
  );
}

/** Fila de nota de voz con play/pausa. */
function AudioRow({ media, index }: { media: WaypointMedia; index: number }) {
  const player = useAudioPlayer(media.uri);
  const status = useAudioPlayerStatus(player);
  const playing = status.playing;

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
