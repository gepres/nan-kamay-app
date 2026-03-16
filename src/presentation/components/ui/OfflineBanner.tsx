import { useEffect } from 'react';
import { View, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  visible: boolean;
}

export default function OfflineBanner({ visible }: Props) {
  const translateY = useSharedValue(-40);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, { damping: 20, stiffness: 250 });
      opacity.value = withTiming(1, { duration: 200 });
    } else {
      translateY.value = withTiming(-40, { duration: 250 });
      opacity.value = withTiming(0, { duration: 250 });
    }
  }, [visible]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={animStyle}>
      <View style={{
        backgroundColor: '#F59E0B',
        paddingVertical: 6,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
      }}>
        <Ionicons name="cloud-offline-outline" size={14} color="#0D1B12" />
        <Text style={{ color: '#0D1B12', fontSize: 12, fontWeight: '600' }}>
          Sin conexión — las rutas se guardan localmente
        </Text>
      </View>
    </Animated.View>
  );
}
