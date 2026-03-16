import { View, Text, TouchableOpacity } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@presentation/theme/colors';

const TAB_CONFIG: Record<string, { label: string; icon: string; iconActive: string }> = {
  index:   { label: 'INICIO',   icon: 'home-outline',    iconActive: 'home' },
  explore: { label: 'EXPLORAR', icon: 'compass-outline', iconActive: 'compass' },
  profile: { label: 'PERFIL',   icon: 'person-outline',  iconActive: 'person' },
};

export default function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={{
      backgroundColor: colors.bgPrimary,
      paddingTop: 12,
      paddingHorizontal: 21,
      paddingBottom: Math.max(insets.bottom, 21),
    }}>
      <View style={{
        backgroundColor: colors.bgCard,
        borderRadius: 36,
        borderWidth: 1,
        borderColor: colors.border,
        height: 62,
        flexDirection: 'row',
        padding: 4,
      }}>
        {state.routes.map((route, index) => {
          const tab = TAB_CONFIG[route.name];
          if (!tab) return null;
          const isFocused = state.index === index;

          return (
            <TouchableOpacity
              key={route.key}
              onPress={() => navigation.navigate(route.name)}
              activeOpacity={0.8}
              style={{
                flex: 1,
                backgroundColor: isFocused ? colors.accent : 'transparent',
                borderRadius: 26,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
              }}
            >
              <Ionicons
                name={(isFocused ? tab.iconActive : tab.icon) as any}
                size={18}
                color={isFocused ? colors.bgPrimary : colors.textMuted}
              />
              <Text style={{
                color: isFocused ? colors.bgPrimary : colors.textMuted,
                fontSize: 10,
                fontWeight: isFocused ? '600' : '500',
                letterSpacing: 0.5,
              }}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
