import { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, Alert, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTrackingStore } from '@presentation/stores/trackingStore';
import { useUiStore } from '@presentation/stores/uiStore';
import { useAuthStore } from '@presentation/stores/authStore';
import { useLiveShareStore } from '@presentation/stores/liveShareStore';
import { useTracking } from '@presentation/hooks/useTracking';
import { startLiveShare, endLiveShare } from '@application/live/liveShareUseCases';
import { trackEvent } from '@infrastructure/services/AnalyticsService';
import { composeFollowMessage } from '@application/safety/buildLocationShare';
import { liveFollowUrl } from '@infrastructure/config/env';
import { getTrustedContacts } from '@shared/utils/trustedContacts';
import ShareMessageSheet from '@presentation/components/ui/ShareMessageSheet';
import { useElapsedTime } from '@presentation/hooks/useElapsedTime';
import { gpsService } from '@infrastructure/services/GpsServiceImpl';
import TrackingMap from '@presentation/components/map/TrackingMap';
import GpsIndicator from '@presentation/components/tracking/GpsIndicator';
import LayerSelectorModal from '@presentation/components/map/LayerSelectorModal';
import { formatDistance, formatDuration, formatSpeed, formatElevation } from '@shared/utils/formatters';
import { distanceToPolylineMeters } from '@shared/utils/geometry';
import { colors } from '@presentation/theme/colors';

/** Umbral en metros para avisar al usuario que se desvió de la ruta guía. */
const DEVIATION_THRESHOLD_M = 50;

export default function ActiveTrackingScreen() {
  const insets = useSafeAreaInsets();
  const {
    status,
    routeId,
    routeName,
    liveStats,
    gpsPoints,
    currentPosition,
    guide,
    autoPaused,
    pauseRecording,
    resumeRecording,
    finishRecording,
  } = useTrackingStore();
  const { audioCues, setAudioCues, showToast } = useUiStore();
  const liveActive = useLiveShareStore((s) => s.active);

  // Distancia a la traza guía (solo si estamos siguiendo una ruta).
  // Se recalcula cada vez que cambia la posición o la guía — barato porque
  // distanceToPolylineMeters es O(n) sobre los puntos guía (típicamente < 5k).
  const deviationMeters = (guide && currentPosition)
    ? distanceToPolylineMeters(
        currentPosition.latitude,
        currentPosition.longitude,
        guide.guidePoints,
      )
    : null;
  const offRoute = deviationMeters !== null && deviationMeters > DEVIATION_THRESHOLD_M;

  const { requestPermissions } = useTracking();
  const elapsed = useElapsedTime();

  // Map control refs
  const mapRef = useRef<{ zoomIn: () => void; zoomOut: () => void; resetNorth: () => void } | null>(null);
  const [mapLayer, setMapLayer] = useState('outdoors');
  const [mapHeading, setMapHeading] = useState(0);
  const [layerModalVisible, setLayerModalVisible] = useState(false);
  // Bottom sheet para compartir el enlace de seguimiento en vivo (PR2).
  const [shareInfo, setShareInfo] = useState<{ message: string; link: string; phones: string[] } | null>(null);

  // Animación de entrada de paneles
  const statsOpacity    = useSharedValue(0);
  const statsTranslateY = useSharedValue(-16);
  const ctrlOpacity     = useSharedValue(0);
  const ctrlTranslateY  = useSharedValue(24);

  useEffect(() => {
    statsOpacity.value    = withTiming(1,  { duration: 400 });
    statsTranslateY.value = withSpring(0,  { damping: 20, stiffness: 180 });
    ctrlOpacity.value     = withTiming(1,  { duration: 450 });
    ctrlTranslateY.value  = withSpring(0,  { damping: 20, stiffness: 180 });
  }, []);

  const statsStyle = useAnimatedStyle(() => ({
    opacity: statsOpacity.value,
    transform: [{ translateY: statsTranslateY.value }],
  }));
  const ctrlStyle = useAnimatedStyle(() => ({
    opacity: ctrlOpacity.value,
    transform: [{ translateY: ctrlTranslateY.value }],
  }));

  // Precisión del último punto GPS para el indicador de señal
  const lastAccuracy = gpsPoints.length > 0
    ? gpsPoints[gpsPoints.length - 1].accuracy
    : null;

  // Solicitar permisos GPS al montar la pantalla
  useEffect(() => {
    requestPermissions().then((granted) => {
      if (!granted) {
        Alert.alert(
          'Permiso GPS requerido',
          'Ñan Kamay necesita acceso a tu ubicación para grabar la ruta. Habilítalo en Configuración.',
          [{ text: 'OK', onPress: () => router.back() }]
        );
      }
    });
  }, []);

  const handlePauseResume = () => {
    if (status === 'recording') {
      pauseRecording();
    } else {
      resumeRecording();
    }
  };

  const handleStop = () => {
    Alert.alert(
      'Finalizar ruta',
      `Has recorrido ${formatDistance(liveStats.distanceMeters)} en ${formatDuration(elapsed)}.\n¿Deseas guardar esta ruta?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Finalizar',
          onPress: async () => {
            // Detener el GPS explícitamente ANTES de navegar para no depender
            // del efecto de useTracking (race al desmontar → GPS/notif vivos).
            try {
              await gpsService.stopTracking();
            } catch (e) {
              console.error(e);
            }
            // Cerrar el seguimiento en vivo explícitamente (mismo motivo que el
            // GPS: no depender del efecto al desmontar).
            const live = useLiveShareStore.getState();
            if (live.active && live.session) {
              endLiveShare(live.session.id).catch(() => {});
              live.clear();
            }
            finishRecording();
            router.replace('/tracking/summary');
          },
        },
      ]
    );
  };

  const handleAddWaypoint = () => {
    router.push('/tracking/waypoint');
  };

  const handleCompass = () => {
    mapRef.current?.resetNorth();
  };

  const handleZoomIn = () => {
    mapRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    mapRef.current?.zoomOut();
  };

  const handleToggleLayer = () => {
    setLayerModalVisible(true);
  };

  // Construye el mensaje + enlace + teléfonos y abre el bottom sheet de compartir.
  const openLiveShareSheet = async (token: string, ownerName: string) => {
    const link = liveFollowUrl(token);
    const message = composeFollowMessage(link, ownerName);
    let phones: string[] = [];
    try { phones = (await getTrustedContacts()).map((c) => c.phone); } catch { /* sin contactos */ }
    setShareInfo({ message, link, phones });
  };

  // Botón "Compartir en vivo" (PR2). Si ya está activo, abre el gestor (compartir
  // por varios canales + dejar de compartir); si no, crea la sesión y lo abre.
  const handleToggleLiveShare = async () => {
    const live = useLiveShareStore.getState();
    if (live.active && live.session) {
      const u = useAuthStore.getState().user;
      openLiveShareSheet(live.session.token, u?.fullName || 'Tu contacto');
      return;
    }
    const u = useAuthStore.getState().user;
    if (!u) { showToast('Inicia sesión para compartir en vivo.', 'error'); return; }
    const ownerName = u.fullName || 'Tu contacto';
    try {
      const handle = await startLiveShare({
        userId: u.id,
        routeId,
        ownerName,
        distanceMeters: liveStats.distanceMeters,
      });
      useLiveShareStore.getState().setSession(handle);
      trackEvent('live_share_started');
      showToast('Compartir en vivo activado.', 'success');
      openLiveShareSheet(handle.token, ownerName);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo iniciar el vivo.', 'error');
    }
  };

  const stopLiveShare = () => {
    const live = useLiveShareStore.getState();
    if (live.session) endLiveShare(live.session.id).catch(() => {});
    live.clear();
    setShareInfo(null);
    showToast('Dejaste de compartir en vivo.', 'info');
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#0D1B12' }}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Mapa MapLibre con Thunderforest Outdoors */}
      <TrackingMap
        ref={mapRef}
        followUser={status === 'recording'}
        mapLayer={mapLayer}
        onRegionChange={(heading) => setMapHeading(heading)}
      />

      {/* Panel superior de estadísticas */}
      <Animated.View style={[{
        position: 'absolute',
        top: insets.top + 8,
        left: 16,
        right: 16,
        backgroundColor: '#0D1B12E6',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#2D6A4F80',
        paddingHorizontal: 20,
        paddingVertical: 12,
        flexDirection: 'row',
        justifyContent: 'space-between',
      }, statsStyle]}>
        <StatItem label="Distancia" value={formatDistance(liveStats.distanceMeters)} />
        <StatItem label="Tiempo" value={formatDuration(elapsed)} />
        <StatItem label="Vel." value={formatSpeed(liveStats.avgSpeedKmh)} />
        <StatItem label="Subida" value={formatElevation(liveStats.elevationGainMeters)} />
      </Animated.View>

      {/* Indicador GPS */}
      <View style={{ position: 'absolute', top: insets.top + 92, left: 16 }}>
        <GpsIndicator accuracy={lastAccuracy} />
      </View>

      {/* Indicador de auto-pausa (centrado) */}
      {autoPaused && status === 'recording' && (
        <View pointerEvents="none" style={{ position: 'absolute', top: insets.top + 92, left: 0, right: 0, alignItems: 'center' }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 6,
            backgroundColor: '#F59E0B20', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
            borderWidth: 1, borderColor: '#F59E0B40',
          }}>
            <Ionicons name="pause" size={14} color={colors.accent} />
            <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '600' }}>Auto-pausado</Text>
          </View>
        </View>
      )}

      {/* Banner de desvío (solo si estamos siguiendo una ruta y nos alejamos) */}
      {guide && deviationMeters !== null && (
        <View style={{
          position: 'absolute',
          top: insets.top + 150,
          left: 16,
          right: 16,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          backgroundColor: offRoute ? '#EF4444E6' : '#60A5FAE6',
          borderRadius: 12,
          paddingHorizontal: 14,
          paddingVertical: 10,
        }}>
          <Ionicons
            name={offRoute ? 'warning-outline' : 'git-branch-outline'}
            size={18}
            color="#fff"
          />
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
              {offRoute ? 'Te desviaste de la ruta' : 'Siguiendo'}
            </Text>
            <Text style={{ color: '#fff', fontSize: 11, opacity: 0.9, marginTop: 1 }} numberOfLines={1}>
              {guide.parentName} · {formatDistance(deviationMeters)} {offRoute ? 'fuera' : 'de la traza'}
            </Text>
          </View>
        </View>
      )}

      {/* Brújula — rotates with map heading, press to reset north */}
      <TouchableOpacity
        onPress={handleCompass}
        style={{
          position: 'absolute',
          top: insets.top + 92,
          right: 16,
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: '#0D1B12E6',
          borderWidth: 1,
          borderColor: '#2D6A4F80',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View style={{ transform: [{ rotate: `${-mapHeading}deg` }], alignItems: 'center' }}>
          <Text style={{ color: '#EF4444', fontSize: 10, fontWeight: '700' }}>N</Text>
          <Ionicons name="navigate" size={20} color={colors.textPrimary} />
        </View>
      </TouchableOpacity>

      {/* Zoom Controls */}
      <View style={{
        position: 'absolute',
        top: insets.top + 152,
        right: 16,
        borderRadius: 14,
        backgroundColor: '#0D1B12E6',
        borderWidth: 1,
        borderColor: '#2D6A4F80',
        overflow: 'hidden',
        width: 44,
      }}>
        <TouchableOpacity
          onPress={handleZoomIn}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="add" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ height: 1, backgroundColor: '#2D6A4F80' }} />
        <TouchableOpacity
          onPress={handleZoomOut}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="remove" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Layer Toggle */}
      <TouchableOpacity
        onPress={handleToggleLayer}
        style={{
          position: 'absolute',
          top: insets.top + 252,
          right: 16,
          width: 44,
          height: 44,
          borderRadius: 14,
          backgroundColor: '#0D1B12E6',
          borderWidth: 1,
          borderColor: '#2D6A4F80',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="layers" size={20} color={colors.textPrimary} />
      </TouchableOpacity>

      {/* Anuncios de audio (toggle) */}
      <TouchableOpacity
        onPress={() => setAudioCues(!audioCues)}
        style={{
          position: 'absolute',
          top: insets.top + 304,
          right: 16,
          width: 44,
          height: 44,
          borderRadius: 14,
          backgroundColor: audioCues ? colors.accentSoft : '#0D1B12E6',
          borderWidth: 1,
          borderColor: audioCues ? colors.accent : '#2D6A4F80',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={audioCues ? 'volume-high' : 'volume-mute'} size={20} color={audioCues ? colors.accent : colors.textPrimary} />
      </TouchableOpacity>

      {/* Seguridad — avisar ubicación a contactos (SMS, funciona offline) */}
      <TouchableOpacity
        onPress={() => router.push('/safety')}
        style={{
          position: 'absolute',
          top: insets.top + 356,
          right: 16,
          width: 44,
          height: 44,
          borderRadius: 14,
          backgroundColor: '#0D1B12E6',
          borderWidth: 1,
          borderColor: '#2D6A4F80',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="shield-checkmark" size={20} color={colors.danger} />
      </TouchableOpacity>

      {/* Compartir en vivo (toggle) — transmite tu posición a contactos por SMS */}
      <TouchableOpacity
        onPress={handleToggleLiveShare}
        style={{
          position: 'absolute',
          top: insets.top + 408,
          right: 16,
          width: 44,
          height: 44,
          borderRadius: 14,
          backgroundColor: liveActive ? colors.accentSoft : '#0D1B12E6',
          borderWidth: 1,
          borderColor: liveActive ? colors.accent : '#2D6A4F80',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={liveActive ? 'radio' : 'radio-outline'} size={20} color={liveActive ? colors.accent : colors.textPrimary} />
      </TouchableOpacity>

      {/* Controles inferiores */}
      <Animated.View style={[{
        position: 'absolute',
        bottom: 36,
        left: 16,
        right: 16,
        backgroundColor: '#0D1B12EE',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#2D6A4F80',
        padding: 20,
        gap: 14,
      }, ctrlStyle]}>
        {/* Nombre de la ruta + puntos grabados */}
        <View style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 15, flex: 1 }} numberOfLines={1}>
            {routeName}
          </Text>
          <View style={{
            backgroundColor: colors.bgCard,
            borderRadius: 8,
            paddingHorizontal: 8,
            paddingVertical: 3,
          }}>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>
              {gpsPoints.length} pts
            </Text>
          </View>
        </View>

        {/* Botones de control */}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {/* Añadir waypoint */}
          <ControlButton
            icon="flag-outline"
            label="Waypoint"
            color={colors.accent}
            bgColor={colors.bgCard}
            onPress={handleAddWaypoint}
          />

          {/* Pausa / Reanudar */}
          <ControlButton
            icon={status === 'recording' ? 'pause-outline' : 'play-outline'}
            label={status === 'recording' ? 'Pausar' : 'Reanudar'}
            color="#F59E0B"
            bgColor={colors.bgCard}
            onPress={handlePauseResume}
          />

          {/* Finalizar */}
          <ControlButton
            icon="stop-circle-outline"
            label="Finalizar"
            color="#EF4444"
            bgColor="#EF444415"
            borderColor="#EF444430"
            onPress={handleStop}
          />
        </View>
      </Animated.View>

      {/* Layer Selector Modal */}
      <LayerSelectorModal
        visible={layerModalVisible}
        selectedLayer={mapLayer}
        onSelect={(key) => {
          setMapLayer(key);
          setLayerModalVisible(false);
        }}
        onClose={() => setLayerModalVisible(false)}
      />

      {/* Compartir enlace en vivo (WhatsApp / SMS / copiar / más) */}
      <ShareMessageSheet
        visible={shareInfo !== null}
        onClose={() => setShareInfo(null)}
        title="Compartir en vivo"
        subtitle="Tu contacto abre el enlace en Ñan Kamay (Perfil › Seguridad › Seguir a un contacto) y te ve en tiempo real."
        message={shareInfo?.message ?? ''}
        smsPhones={shareInfo?.phones ?? []}
        copyText={shareInfo?.link}
        copyLabel="Copiar enlace"
        copySub="Para pegarlo donde quieras"
        smsLabel="SMS a mis contactos"
        smsSub="A tus contactos de confianza"
        onStop={stopLiveShare}
        stopLabel="Dejar de compartir en vivo"
      />
    </View>
  );
}

// ── Componentes internos ──────────────────────────────────────────

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '700' }}>{value}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

interface ControlButtonProps {
  icon: string;
  label: string;
  color: string;
  bgColor: string;
  borderColor?: string;
  onPress: () => void;
}

function ControlButton({ icon, label, color, bgColor, borderColor, onPress }: ControlButtonProps) {
  const scale = useSharedValue(1);
  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={[{ flex: 1 }, btnStyle]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => { scale.value = withSpring(0.93, { damping: 20, stiffness: 300 }); }}
        onPressOut={() => { scale.value = withSpring(1,    { damping: 20, stiffness: 300 }); }}
        style={{
          backgroundColor: bgColor,
          borderRadius: 12,
          paddingVertical: 12,
          alignItems: 'center',
          gap: 4,
          borderWidth: borderColor ? 1 : 0,
          borderColor: borderColor,
        }}
      >
        <Ionicons name={icon as any} size={22} color={color} />
        <Text style={{ color, fontSize: 11, fontWeight: '600' }}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}
