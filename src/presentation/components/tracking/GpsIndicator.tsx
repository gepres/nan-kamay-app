import { useEffect } from 'react';
import { View, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { useTrackingStore } from '@presentation/stores/trackingStore';

interface Props {
  accuracy: number | null;
}

function getSignalQuality(accuracy: number | null): {
  label: string;
  color: string;
  bgColor: string;
} {
  if (accuracy === null) return { label: 'Sin señal', color: '#EF4444', bgColor: '#EF444420' };
  if (accuracy <= 5)  return { label: 'GPS excelente', color: '#22C55E', bgColor: '#22C55E20' };
  if (accuracy <= 15) return { label: 'GPS bueno',     color: '#22C55E', bgColor: '#22C55E20' };
  if (accuracy <= 30) return { label: 'GPS regular',   color: '#F59E0B', bgColor: '#F59E0B20' };
  return { label: 'GPS débil', color: '#EF4444', bgColor: '#EF444420' };
}

export default function GpsIndicator({ accuracy }: Props) {
  const { status } = useTrackingStore();
  const { label, color, bgColor } = getSignalQuality(accuracy);

  // Pulso del dot: escala 1 → 1.6 → 1, repetido
  const dotScale = useSharedValue(1);
  const dotOpacity = useSharedValue(1);

  useEffect(() => {
    if (status === 'recording') {
      dotScale.value = withRepeat(
        withSequence(
          withTiming(1.7, { duration: 700, easing: Easing.out(Easing.ease) }),
          withTiming(1,   { duration: 700, easing: Easing.in(Easing.ease) }),
        ),
        -1,
        false,
      );
      dotOpacity.value = withRepeat(
        withSequence(
          withTiming(0.3, { duration: 700 }),
          withTiming(1,   { duration: 700 }),
        ),
        -1,
        false,
      );
    } else {
      dotScale.value = withTiming(1, { duration: 200 });
      dotOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [status]);

  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: dotScale.value }],
    opacity: dotOpacity.value,
  }));

  if (status === 'paused') {
    return (
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F59E0B20',
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 6,
        gap: 6,
      }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#F59E0B' }} />
        <Text style={{ color: '#F59E0B', fontSize: 12, fontWeight: '600' }}>PAUSADO</Text>
      </View>
    );
  }

  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: bgColor,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 6,
      gap: 6,
    }}>
      <Animated.View
        style={[
          { width: 8, height: 8, borderRadius: 4, backgroundColor: color },
          dotStyle,
        ]}
      />
      <Text style={{ color, fontSize: 12, fontWeight: '600' }}>{label}</Text>
      {accuracy !== null && (
        <Text style={{ color, fontSize: 11, opacity: 0.8 }}>±{Math.round(accuracy)}m</Text>
      )}
    </View>
  );
}
