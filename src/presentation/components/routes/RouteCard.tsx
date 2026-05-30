import { useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { colors } from '@presentation/theme/colors';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Route } from '@core/entities/Route';
import { DifficultyLabel } from '@core/value-objects/Difficulty';
import { formatDistance, formatDuration, formatDate, formatElevation } from '@shared/utils/formatters';
import ElevationSparkline from '@presentation/components/routes/ElevationSparkline';

const difficultyColors: Record<string, string> = {
  easy: colors.easy,
  moderate: colors.medium,
  hard: colors.hard,
  very_hard: colors.veryHard,
  expert: colors.expert,
};

/** Icono Ionicons aproximado según el tipo de actividad. */
function activityIcon(type?: string): string {
  const t = (type ?? '').toLowerCase();
  if (t.includes('cicl') || t.includes('bici') || t.includes('mtb') || t.includes('bike')) return 'bicycle';
  return 'walk';
}

interface Props {
  route: Route;
  onPress?: () => void;
  index?: number;
  /** Muestras normalizadas del perfil de elevación (firma visual). */
  profile?: number[];
}

export default function RouteCard({ route, onPress, index = 0, profile }: Props) {
  const diffColor = difficultyColors[route.difficulty];

  // Entrada staggered por index
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);
  const scale = useSharedValue(1);

  useEffect(() => {
    const delay = index * 60;
    opacity.value = withDelay(delay, withTiming(1, { duration: 300 }));
    translateY.value = withDelay(delay, withSpring(0, { damping: 18, stiffness: 200 }));
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.97, { damping: 20, stiffness: 300 });
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 20, stiffness: 300 });
  };

  return (
    <Animated.View style={animStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={{
          backgroundColor: colors.bgCard,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          marginBottom: 10,
          overflow: 'hidden',
        }}
      >
        <View style={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10, gap: 12 }}>
          {/* Icono de actividad + título + (pendiente sync) + dificultad */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{
              width: 34, height: 34, borderRadius: 10,
              backgroundColor: colors.accentSoft,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Ionicons name={activityIcon(route.activityType) as any} size={18} color={colors.accent} />
            </View>

            <Text
              style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '700', flex: 1 }}
              numberOfLines={1}
            >
              {route.name}
            </Text>

            {!route.isSynced && (
              <Ionicons name="cloud-upload-outline" size={15} color={colors.accent} />
            )}

            <View style={{
              backgroundColor: diffColor + '20',
              borderRadius: 8,
              paddingHorizontal: 9,
              paddingVertical: 4,
            }}>
              <Text style={{ color: diffColor, fontSize: 11, fontWeight: '700', letterSpacing: 0.3 }}>
                {DifficultyLabel[route.difficulty]}
              </Text>
            </View>
          </View>

          {/* Stats clave en línea */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
            <Stat icon="navigate-outline" value={formatDistance(route.distanceMeters)} />
            <Stat icon="time-outline" value={formatDuration(route.durationSeconds)} />
            <Stat icon="trending-up-outline" value={formatElevation(route.elevationGainMeters)} />
          </View>

          {/* Actividad · fecha */}
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            {route.activityType ? `${route.activityType} · ` : ''}{formatDate(route.createdAt)}
          </Text>
        </View>

        {/* Firma de elevación (perfil real de la ruta) al pie */}
        {profile && <ElevationSparkline data={profile} height={44} />}
      </Pressable>
    </Animated.View>
  );
}

function Stat({ icon, value }: { icon: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <Ionicons name={icon as any} size={14} color={colors.accent} />
      <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>{value}</Text>
    </View>
  );
}
