import { useEffect } from 'react';
import { View, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
} from 'react-native-reanimated';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Route } from '@core/entities/Route';
import { DifficultyLabel } from '@core/value-objects/Difficulty';
import { formatDistance, formatDuration, formatDate, formatElevation } from '@shared/utils/formatters';

const difficultyColors = {
  easy: '#4ADE80',
  moderate: '#F59E0B',
  hard: '#EF4444',
};

interface Props {
  route: Route;
  onPress?: () => void;
  onDelete?: () => void;
  index?: number;
}

export default function RouteCard({ route, onPress, onDelete, index = 0 }: Props) {
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
          backgroundColor: '#1A2E1F',
          borderRadius: 12,
          padding: 16,
          borderWidth: 1,
          borderColor: '#2D6A4F',
          marginBottom: 12,
        }}
      >
        {/* Fila superior: nombre + badge dificultad + sync */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 }}>
          <Text
            style={{ color: '#E8F5E9', fontSize: 15, fontWeight: '700', flex: 1 }}
            numberOfLines={1}
          >
            {route.name}
          </Text>

          <View style={{
            backgroundColor: diffColor + '20',
            borderRadius: 6,
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderWidth: 1,
            borderColor: diffColor + '60',
          }}>
            <Text style={{ color: diffColor, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>
              {DifficultyLabel[route.difficulty]}
            </Text>
          </View>

          {!route.isSynced && (
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#F59E0B' }} />
          )}

          {onDelete && (
            <Pressable onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="trash-outline" size={16} color="#6B8F71" />
            </Pressable>
          )}
        </View>

        {/* Stats */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <StatChip icon="navigate-outline" value={formatDistance(route.distanceMeters)} />
          <StatChip icon="time-outline" value={formatDuration(route.durationSeconds)} />
          <StatChip icon="arrow-up-outline" value={formatElevation(route.elevationGainMeters)} />
          <StatChip icon="speedometer-outline" value={`${route.avgSpeedKmh.toFixed(1)} km/h`} />
        </View>

        <Text style={{ color: '#6B8F71', fontSize: 12, marginTop: 10 }}>
          {formatDate(route.createdAt)}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function StatChip({ icon, value }: { icon: string; value: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <Ionicons name={icon as any} size={14} color="#22C55E" />
      <Text style={{ color: '#E8F5E9', fontSize: 12, fontWeight: '600' }}>{value}</Text>
    </View>
  );
}
