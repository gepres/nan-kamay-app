import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useUiStore, Toast } from '@presentation/stores/uiStore';

const TOAST_COLORS = {
  success: { bg: '#22C55E18', border: '#22C55E50', icon: '#22C55E', text: '#E8F5E9' },
  error:   { bg: '#EF444418', border: '#EF444450', icon: '#EF4444', text: '#FEE2E2' },
  info:    { bg: '#3B82F618', border: '#3B82F650', icon: '#3B82F6', text: '#DBEAFE' },
} as const;

const TOAST_ICONS = {
  success: 'checkmark-circle-outline',
  error:   'alert-circle-outline',
  info:    'information-circle-outline',
} as const;

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const translateY = useSharedValue(-60);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.92);

  useEffect(() => {
    translateY.value = withSpring(0, { damping: 18, stiffness: 220 });
    opacity.value = withTiming(1, { duration: 200 });
    scale.value = withSpring(1, { damping: 18, stiffness: 220 });
  }, []);

  const dismiss = () => {
    translateY.value = withTiming(-60, { duration: 220 });
    opacity.value = withTiming(0, { duration: 220 }, (finished) => {
      if (finished) runOnJS(onDismiss)();
    });
    scale.value = withTiming(0.92, { duration: 220 });
  };

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
    opacity: opacity.value,
  }));

  const colors = TOAST_COLORS[toast.type];
  const iconName = TOAST_ICONS[toast.type];

  return (
    <Animated.View
      style={[
        styles.toast,
        { backgroundColor: colors.bg, borderColor: colors.border },
        animStyle,
      ]}
    >
      <Ionicons name={iconName as any} size={18} color={colors.icon} />
      <Text style={[styles.message, { color: colors.text }]} numberOfLines={2}>
        {toast.message}
      </Text>
      <Pressable onPress={dismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="close" size={16} color={colors.icon} />
      </Pressable>
    </Animated.View>
  );
}

export default function ToastContainer() {
  const { toasts, dismissToast } = useUiStore();

  if (toasts.length === 0) return null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => dismissToast(t.id)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
    zIndex: 9999,
    gap: 8,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  message: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
});
