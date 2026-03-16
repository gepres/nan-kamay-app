import { View, Text, TouchableOpacity, SafeAreaView, Alert } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@infrastructure/supabase/supabaseClient';
import { useAuthStore } from '@presentation/stores/authStore';

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
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0D1B12' }}>
      <View style={{ padding: 20 }}>
        <Text style={{ color: '#E8F5E9', fontSize: 22, fontWeight: '700', marginBottom: 32 }}>
          Perfil
        </Text>

        <View style={{ alignItems: 'center', marginBottom: 40 }}>
          <View style={{
            width: 80, height: 80,
            borderRadius: 40,
            backgroundColor: '#1A2E1F',
            borderWidth: 2,
            borderColor: '#22C55E',
            justifyContent: 'center',
            alignItems: 'center',
          }}>
            <Ionicons name="person" size={40} color="#22C55E" />
          </View>
          <Text style={{ color: '#E8F5E9', fontSize: 18, fontWeight: '600', marginTop: 12 }}>
            {user?.fullName ?? 'Usuario'}
          </Text>
          <Text style={{ color: '#6B8F71', fontSize: 14, marginTop: 4 }}>
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
