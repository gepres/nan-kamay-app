import { useState, useCallback, useEffect, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useAudioRecorder, RecordingPresets, AudioModule } from 'expo-audio';
import WaypointIcon from '@presentation/components/ui/WaypointIcon';
import LocationPickerModal from '@presentation/components/map/LocationPickerModal';
import { useTrackingStore } from '@presentation/stores/trackingStore';
import { Waypoint, WaypointMedia } from '@core/entities/Waypoint';
import { persistWaypointMedia } from '@shared/utils/waypointMedia';
import { getWaypointTypeInfo, type WaypointTypeInfo } from '@shared/constants/waypointTypes';
import { consumePendingWaypointType } from '@shared/utils/waypointSelection';
import { appendDraftWaypoint } from '@application/tracking/DraftRouteUseCase';
import { colors } from '@presentation/theme/colors';

const DEFAULT_ICON_COLOR = '#F59E0B';
const RECENTS_KEY = 'nk:recentWaypointTypes';
const MAX_PER_TYPE = 3;       // máx 3 fotos, 3 videos, 3 notas de voz (por waypoint)
const MAX_VIDEO_SEC = 15;
const MAX_AUDIO_SEC = 45;

const addTileStyle = {
  width: 96, height: 96, borderRadius: 10,
  backgroundColor: colors.bgInput, borderWidth: 1.5, borderColor: colors.border,
  borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 4,
} as const;
const addTileText = { color: colors.textMuted, fontSize: 11, fontWeight: '500' } as const;

function RemoveBtn({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={{
        position: 'absolute', top: -8, right: -8,
        backgroundColor: colors.danger, borderRadius: 12,
        width: 24, height: 24, alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Ionicons name="close" size={14} color="#fff" />
    </TouchableOpacity>
  );
}

export default function WaypointScreen() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [waypointType, setWaypointType] = useState('Mirador');
  const [media, setMedia] = useState<WaypointMedia[]>([]);
  const [recentTypes, setRecentTypes] = useState<WaypointTypeInfo[]>([]);
  const [picked, setPicked] = useState<{ lat: number; lon: number } | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const { addWaypoint, routeId, currentPosition } = useTrackingStore();

  // Grabador de notas de voz (expo-audio).
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording, setIsRecording] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const photos = media.filter((m) => m.type === 'image');
  const videos = media.filter((m) => m.type === 'video');
  const audios = media.filter((m) => m.type === 'audio');

  // Check for pending type selection when screen regains focus (returning from selector)
  useFocusEffect(
    useCallback(() => {
      const pending = consumePendingWaypointType();
      if (pending) {
        setWaypointType(pending);
        addToRecents(pending);
      }
    }, [])
  );

  // Cargar recientes persistidos al montar (sobreviven al cierre del modal/app).
  useEffect(() => {
    AsyncStorage.getItem(RECENTS_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          const labels: string[] = JSON.parse(raw);
          const infos = labels
            .map((l) => getWaypointTypeInfo(l))
            .filter((x): x is WaypointTypeInfo => !!x)
            .slice(0, 5);
          setRecentTypes(infos);
        } catch {
          /* JSON corrupto: ignorar */
        }
      })
      .catch(() => {});
  }, []);

  const addToRecents = (label: string) => {
    const info = getWaypointTypeInfo(label);
    if (!info) return;
    setRecentTypes((prev) => {
      const next = [info, ...prev.filter((t) => t.label !== label)].slice(0, 5);
      AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next.map((t) => t.label))).catch(() => {});
      return next;
    });
  };

  const handleSelectType = (label: string) => {
    setWaypointType(label);
    addToRecents(label);
  };

  // Persiste la media a almacenamiento estable ANTES de añadirla: la URI del
  // picker/grabador es de cache efímero y puede desaparecer antes del sync.
  const addMedia = async (item: WaypointMedia) => {
    const persisted = await persistWaypointMedia(item);
    setMedia((prev) => [...prev, persisted]);
  };
  const removeMedia = (uri: string) => setMedia((prev) => prev.filter((m) => m.uri !== uri));

  // ── Fotos (cámara/galería) ──
  const pickPhotoFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: MAX_PER_TYPE - photos.length,
    });
    if (!result.canceled) {
      const items = result.assets.slice(0, MAX_PER_TYPE - photos.length)
        .map((a): WaypointMedia => ({ type: 'image', uri: a.uri }));
      items.forEach(addMedia);
    }
  };
  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Activa el acceso a la cámara en Configuración.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      addMedia({ type: 'image', uri: result.assets[0].uri });
    }
  };
  const handleAddPhoto = () => {
    if (photos.length >= MAX_PER_TYPE) return;
    Alert.alert('Agregar foto', '', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Tomar foto', onPress: takePhoto },
      { text: 'Elegir de galería', onPress: pickPhotoFromGallery },
    ]);
  };

  // ── Videos (≤15s) ──
  const makeThumb = async (uri: string): Promise<string | undefined> => {
    try {
      const { uri: thumb } = await VideoThumbnails.getThumbnailAsync(uri, { time: 500, quality: 0.6 });
      return thumb;
    } catch {
      return undefined;
    }
  };
  const recordVideo = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Activa la cámara en Configuración.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      videoMaxDuration: MAX_VIDEO_SEC,
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      addMedia({ type: 'video', uri: a.uri, durationMs: a.duration ?? undefined, thumbnailUri: await makeThumb(a.uri) });
    }
  };
  const pickVideoFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      videoMaxDuration: MAX_VIDEO_SEC,
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      if (a.duration && a.duration > (MAX_VIDEO_SEC + 1) * 1000) {
        Alert.alert('Video muy largo', `El video debe durar máximo ${MAX_VIDEO_SEC} s.`);
        return;
      }
      addMedia({ type: 'video', uri: a.uri, durationMs: a.duration ?? undefined, thumbnailUri: await makeThumb(a.uri) });
    }
  };
  const handleAddVideo = () => {
    if (videos.length >= MAX_PER_TYPE) return;
    Alert.alert('Agregar video', `Máximo ${MAX_VIDEO_SEC} segundos.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Grabar', onPress: recordVideo },
      { text: 'Elegir de galería', onPress: pickVideoFromGallery },
    ]);
  };

  // ── Notas de voz (≤45s) ──
  const stopRecording = useCallback(async () => {
    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null; }
    try {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      if (uri) addMedia({ type: 'audio', uri, durationMs: recSec * 1000 });
    } catch (e) {
      console.error('[audio] stop falló', e);
    } finally {
      setIsRecording(false);
      setRecSec(0);
    }
  }, [audioRecorder, recSec]);

  const startRecording = async () => {
    if (audios.length >= MAX_PER_TYPE) return;
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permiso requerido', 'Activa el micrófono en Configuración.');
      return;
    }
    try {
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setIsRecording(true);
      setRecSec(0);
      recTimerRef.current = setInterval(() => {
        setRecSec((s) => {
          if (s + 1 >= MAX_AUDIO_SEC) { stopRecording(); return MAX_AUDIO_SEC; }
          return s + 1;
        });
      }, 1000);
    } catch (e) {
      console.error('[audio] record falló', e);
      setIsRecording(false);
    }
  };

  // Limpieza del timer al desmontar.
  useEffect(() => () => { if (recTimerRef.current) clearInterval(recTimerRef.current); }, []);

  // Ubicación efectiva: la elegida en el mapa tiene prioridad sobre el GPS.
  const effLat = picked?.lat ?? currentPosition?.latitude;
  const effLon = picked?.lon ?? currentPosition?.longitude;
  const hasLocation =
    effLat != null && effLon != null && Number.isFinite(effLat) && Number.isFinite(effLon) &&
    !(effLat === 0 && effLon === 0);

  const handleSave = () => {
    if (!title.trim() || !routeId) return;

    // Sin ubicación (GPS sin fix y sin colocar en el mapa) no guardamos: antes
    // se guardaba en (0,0) — golfo de Guinea — sin aviso.
    if (!hasLocation) {
      Alert.alert(
        'Falta la ubicación',
        'Aún no hay señal GPS. Coloca el punto en el mapa con "Ajustar en mapa".',
        [{ text: 'Entendido' }],
      );
      return;
    }

    const waypoint = Waypoint.create({
      routeId,
      latitude: effLat as number,
      longitude: effLon as number,
      // La altitud solo viene del GPS; si se colocó manualmente, queda nula.
      altitude: picked ? null : currentPosition?.altitude ?? null,
      title: title.trim(),
      description: description.trim() || undefined,
      type: waypointType,
      media,
    });

    addWaypoint(waypoint);
    appendDraftWaypoint(waypoint).catch((e) =>
      console.error('[draft] no se pudo persistir waypoint', e)
    );
    router.back();
  };

  const handleViewAllTypes = () => {
    router.push({
      pathname: '/tracking/waypoint-types',
      params: {
        current: waypointType,
        recents: JSON.stringify(recentTypes),
      },
    });
  };

  const alt = picked ? null : currentPosition?.altitude;

  // Current type info for the chip display
  const currentTypeInfo = getWaypointTypeInfo(waypointType);

  const inputStyle = {
    backgroundColor: colors.bgInput,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: colors.textPrimary,
    fontSize: 16,
  } as const;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingTop: 20,
          marginBottom: 16,
        }}>
          <Text style={{ color: colors.textPrimary, fontSize: 28, fontWeight: '700' }}>
            Agregar Punto
          </Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="close" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Ubicación: GPS actual o la colocada en el mapa, con botón para ajustar */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          marginHorizontal: 20,
          marginBottom: 20,
          backgroundColor: colors.bgCard,
          borderRadius: 10,
          paddingHorizontal: 14,
          paddingVertical: 10,
        }}>
          <Ionicons
            name={picked ? 'pin' : 'location'}
            size={16}
            color={hasLocation ? colors.accent : colors.danger}
          />
          <Text style={{ color: hasLocation ? colors.textSecondary : colors.danger, fontSize: 12, fontWeight: '500', flex: 1 }}>
            {hasLocation
              ? `${(effLat as number).toFixed(4)}, ${(effLon as number).toFixed(4)}${alt != null ? ` · ${Math.round(alt)} m` : ''}${picked ? ' · en mapa' : ''}`
              : 'Sin señal GPS — coloca el punto en el mapa'}
          </Text>
          <TouchableOpacity
            onPress={() => setShowPicker(true)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="map-outline" size={14} color={colors.accent} />
            <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '600' }}>
              {picked ? 'Reajustar' : 'Ajustar en mapa'}
            </Text>
          </TouchableOpacity>
        </View>

        <LocationPickerModal
          visible={showPicker}
          initial={{ lat: effLat ?? 0, lon: effLon ?? 0 }}
          title="Colocar punto"
          onConfirm={(c) => { setPicked(c); setShowPicker(false); }}
          onClose={() => setShowPicker(false)}
        />

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 20 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Título */}
          <View>
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '500', marginBottom: 6 }}>
              Título del Punto
            </Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="ej. Paso de Montaña"
              placeholderTextColor={colors.textMuted}
              style={inputStyle}
            />
          </View>

          {/* Descripción */}
          <View>
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '500', marginBottom: 6 }}>
              Descripción
            </Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="¿Qué encontraste aquí?"
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              style={[inputStyle, { minHeight: 80 }]}
            />
          </View>

          {/* Tipo de Punto — label row with "Ver todos" + recent chips */}
          <View>
            <View style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 10,
            }}>
              <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '500' }}>
                Tipo de Punto
              </Text>
              <TouchableOpacity
                onPress={handleViewAllTypes}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
              >
                <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '600' }}>
                  Ver todos
                </Text>
                <Ionicons name="chevron-forward" size={14} color={colors.accent} />
              </TouchableOpacity>
            </View>

            {/* Chips: show current selected + recents */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {/* Always show the current selected type as active chip */}
              {currentTypeInfo && (
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingVertical: 10,
                  paddingHorizontal: 18,
                  borderRadius: 10,
                  backgroundColor: colors.accent,
                }}>
                  <Text style={{ color: colors.bgPrimary, fontWeight: '600', fontSize: 13 }}>
                    {currentTypeInfo.label}
                  </Text>
                </View>
              )}

              {/* Show recent types (excluding the currently selected one) */}
              {recentTypes
                .filter((t) => t.label !== waypointType)
                .map(({ label, icon, iconColor }) => (
                  <TouchableOpacity
                    key={label}
                    onPress={() => handleSelectType(label)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingVertical: 8,
                      paddingHorizontal: 14,
                      borderRadius: 20,
                      backgroundColor: colors.bgCard,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <WaypointIcon name={icon} size={14} color={iconColor || DEFAULT_ICON_COLOR} />
                    <Text style={{ color: colors.textPrimary, fontSize: 13 }}>{label}</Text>
                  </TouchableOpacity>
                ))}
            </View>
          </View>

          {/* ── Fotos ── */}
          <View>
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '500', marginBottom: 10 }}>
              Fotos ({photos.length}/{MAX_PER_TYPE})
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {photos.map((m) => (
                <View key={m.uri} style={{ position: 'relative' }}>
                  <Image source={{ uri: m.uri }} style={{ width: 96, height: 96, borderRadius: 10, borderWidth: 1, borderColor: colors.border }} />
                  <RemoveBtn onPress={() => removeMedia(m.uri)} />
                </View>
              ))}
              {photos.length < MAX_PER_TYPE && (
                <TouchableOpacity onPress={handleAddPhoto} style={addTileStyle}>
                  <Ionicons name="camera-outline" size={26} color={colors.textMuted} />
                  <Text style={addTileText}>Foto</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>

          {/* ── Videos (≤15s) ── */}
          <View>
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '500', marginBottom: 10 }}>
              Videos ({videos.length}/{MAX_PER_TYPE}) · máx {MAX_VIDEO_SEC}s
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {videos.map((m) => (
                <View key={m.uri} style={{ position: 'relative' }}>
                  <View style={{ width: 96, height: 96, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
                    {m.thumbnailUri ? (
                      <Image source={{ uri: m.thumbnailUri }} style={{ width: '100%', height: '100%' }} />
                    ) : (
                      <Ionicons name="videocam" size={26} color={colors.textMuted} />
                    )}
                    <View style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="play-circle" size={30} color="#FFFFFFDD" />
                    </View>
                  </View>
                  <RemoveBtn onPress={() => removeMedia(m.uri)} />
                </View>
              ))}
              {videos.length < MAX_PER_TYPE && (
                <TouchableOpacity onPress={handleAddVideo} style={addTileStyle}>
                  <Ionicons name="videocam-outline" size={26} color={colors.textMuted} />
                  <Text style={addTileText}>Video</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>

          {/* ── Notas de voz (≤45s) ── */}
          <View>
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '500', marginBottom: 10 }}>
              Notas de voz ({audios.length}/{MAX_PER_TYPE}) · máx {MAX_AUDIO_SEC}s
            </Text>
            <View style={{ gap: 8 }}>
              {audios.map((m, i) => (
                <View key={m.uri} style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  backgroundColor: colors.bgCard, borderRadius: 10, padding: 12,
                  borderWidth: 1, borderColor: colors.border,
                }}>
                  <Ionicons name="mic" size={18} color={colors.accent} />
                  <Text style={{ color: colors.textPrimary, fontSize: 14, flex: 1 }}>
                    Nota {i + 1}{m.durationMs ? ` · ${Math.round(m.durationMs / 1000)}s` : ''}
                  </Text>
                  <TouchableOpacity onPress={() => removeMedia(m.uri)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              ))}

              {isRecording ? (
                <TouchableOpacity
                  onPress={stopRecording}
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
                    backgroundColor: colors.danger + '22', borderRadius: 10, paddingVertical: 14,
                    borderWidth: 1, borderColor: colors.danger,
                  }}
                >
                  <View style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: colors.danger }} />
                  <Text style={{ color: colors.danger, fontSize: 14, fontWeight: '700' }}>
                    Grabando {recSec}s · Detener
                  </Text>
                </TouchableOpacity>
              ) : audios.length < MAX_PER_TYPE ? (
                <TouchableOpacity
                  onPress={startRecording}
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                    backgroundColor: colors.bgInput, borderRadius: 10, paddingVertical: 14,
                    borderWidth: 1.5, borderColor: colors.border,
                  }}
                >
                  <Ionicons name="mic-outline" size={20} color={colors.accent} />
                  <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '500' }}>
                    Grabar nota de voz
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {/* Guardar */}
          <TouchableOpacity
            onPress={handleSave}
            disabled={!title.trim()}
            style={{
              backgroundColor: title.trim() ? colors.accent : colors.bgCard,
              borderRadius: 12,
              paddingVertical: 16,
              alignItems: 'center',
              marginTop: 8,
            }}
          >
            <Text style={{
              color: title.trim() ? colors.bgPrimary : colors.textMuted,
              fontSize: 16,
              fontWeight: '700',
            }}>
              Guardar Punto
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
