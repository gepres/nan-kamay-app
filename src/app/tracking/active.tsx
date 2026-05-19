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
import { useTracking } from '@presentation/hooks/useTracking';
import { useElapsedTime } from '@presentation/hooks/useElapsedTime';
import { gpsService } from '@infrastructure/services/GpsServiceImpl';
import TrackingMap from '@presentation/components/map/TrackingMap';
import GpsIndicator from '@presentation/components/tracking/GpsIndicator';
import LayerSelectorModal from '@presentation/components/map/LayerSelectorModal';
import { formatDistance, formatDuration, formatSpeed, formatElevation } from '@shared/utils/formatters';
import { colors } from '@presentation/theme/colors';

export default function ActiveTrackingScreen() {
  const insets = useSafeAreaInsets();
  const {
    status,
    routeName,
    liveStats,
    gpsPoints,
    pauseRecording,
    resumeRecording,
    finishRecording,
  } = useTrackingStore();

  const { requestPermissions } = useTracking();
  const elapsed = useElapsedTime();

  // Map control refs
  const mapRef = useRef<{ zoomIn: () => void; zoomOut: () => void; resetNorth: () => void } | null>(null);
  const [mapLayer, setMapLayer] = useState('outdoors');
  const [mapHeading, setMapHeading] = useState(0);
  const [layerModalVisible, setLayerModalVisible] = useState(false);

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
