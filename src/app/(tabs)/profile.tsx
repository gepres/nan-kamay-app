import { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@infrastructure/supabase/supabaseClient';
import { useAuthStore } from '@presentation/stores/authStore';
import { useRoutesStore } from '@presentation/stores/routesStore';
import { formatDistance, formatDuration, formatElevation } from '@shared/utils/formatters';
import { colors } from '@presentation/theme/colors';

export default function ProfileScreen() {
  const { user } = useAuthStore();
  const { routes } = useRoutesStore();
  const [loggingOut, setLoggingOut] = useState(false);

  const totals = routes.reduce(
    (acc, r) => ({
      distance: acc.distance + r.distanceMeters,
      duration: acc.duration + r.durationSeconds,
      gain: acc.gain + r.elevationGainMeters,
    }),
    { distance: 0, duration: 0, gain: 0 },
  );

  const aggStats = [
    { icon: 'map-outline', label: 'Rutas', value: String(routes.length) },
    { icon: 'navigate-outline', label: 'Distancia total', value: formatDistance(totals.distance) },
    { icon: 'time-outline', label: 'Tiempo total', value: formatDuration(totals.duration) },
    { icon: 'trending-up-outline', label: 'Desnivel acumulado', value: formatElevation(totals.gain, false) },
  ];

  const unsyncedCount = routes.filter((r) => !r.isSynced).length;

  const handleLogout = async () => {
    Alert.alert('Cerrar sesión', '¿Estás seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar sesión',
        style: 'destructive',
        onPress: async () => {
          setLoggingOut(true);
          await supabase.auth.signOut();
          router.replace('/(auth)/login');
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

        {/* Estadísticas agregadas (locales) */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 32 }}>
          {aggStats.map((s) => (
            <View
              key={s.label}
              style={{
                width: '47%',
                backgroundColor: colors.bgCard,
                borderRadius: 12,
                padding: 16,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Ionicons name={s.icon as any} size={20} color={colors.accent} />
              <Text style={{ color: colors.textPrimary, fontSize: 20, fontWeight: '700', marginTop: 8 }}>
                {s.value}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Indicador de sincronización */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            backgroundColor: colors.bgCard,
            borderRadius: 12,
            padding: 16,
            borderWidth: 1,
            borderColor: unsyncedCount > 0 ? '#F59E0B60' : '#22C55E40',
            marginBottom: 32,
          }}
        >
          <Ionicons
            name={unsyncedCount > 0 ? 'cloud-upload-outline' : 'cloud-done-outline'}
            size={22}
            color={unsyncedCount > 0 ? colors.accent : colors.success}
          />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '600' }}>
              {unsyncedCount > 0
                ? `${unsyncedCount} ruta${unsyncedCount > 1 ? 's' : ''} sin sincronizar`
                : 'Todo sincronizado'}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
              {unsyncedCount > 0
                ? 'Sincroniza desde Inicio antes de borrar la app.'
                : 'Tus rutas están respaldadas en la nube.'}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={handleLogout}
          disabled={loggingOut}
          style={{
            backgroundColor: 'transparent',
            borderColor: '#EF4444',
            borderWidth: 1.5,
            borderRadius: 12,
            paddingVertical: 14,
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 8,
            opacity: loggingOut ? 0.6 : 1,
          }}
        >
          {loggingOut ? (
            <ActivityIndicator size="small" color="#EF4444" />
          ) : (
            <Text style={{ color: '#EF4444', fontSize: 16, fontWeight: '600' }}>
              Cerrar sesión
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
