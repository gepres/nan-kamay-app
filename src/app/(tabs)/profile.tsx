import { View, Text, TouchableOpacity, SafeAreaView, Alert } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@infrastructure/supabase/supabaseClient';
import { useAuthStore } from '@presentation/stores/authStore';
import { colors } from '@presentation/theme/colors';

export default function ProfileScreen() {
  const { user } = useAuthStore();

  const handleLogout = async () => {
    Alert.alert('Cerrar sesión', '¿Estás seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar sesión',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <View style={{ padding: 20 }}>
        <Text style={{ color: colors.textPrimary, fontSize: 22, fontWeight: '700', marginBottom: 32 }}>
          Perfil
        </Text>

        <View style={{ alignItems: 'center', marginBottom: 40 }}>
          <View style={{
            width: 80, height: 80,
            borderRadius: 40,
            backgroundColor: colors.bgCard,
            borderWidth: 2,
            borderColor: colors.accent,
            justifyContent: 'center',
            alignItems: 'center',
          }}>
            <Ionicons name="person" size={40} color={colors.accent} />
          </View>
          <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '600', marginTop: 12 }}>
            {user?.fullName ?? 'Usuario'}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14, marginTop: 4 }}>
            {user?.email ?? ''}
          </Text>
        </View>

        <TouchableOpacity
          onPress={handleLogout}
          style={{
            backgroundColor: 'transparent',
            borderColor: '#EF4444',
            borderWidth: 1.5,
            borderRadius: 12,
            paddingVertical: 14,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#EF4444', fontSize: 16, fontWeight: '600' }}>
            Cerrar sesión
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
