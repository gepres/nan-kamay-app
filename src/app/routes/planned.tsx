import { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Route } from '@core/entities/Route';
import { routeRepository } from '@infrastructure/repositories/RouteRepositoryImpl';
import { useAuthStore } from '@presentation/stores/authStore';
import { useUiStore } from '@presentation/stores/uiStore';
import { formatDistance } from '@shared/utils/formatters';
import { colors } from '@presentation/theme/colors';

export default function PlannedRoutesScreen() {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const { showToast } = useUiStore();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!user) { setRoutes([]); setLoading(false); return; }
    setLoading(true);
    routeRepository.getPlannedRoutes(user.id)
      .then(setRoutes)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const confirmDelete = (route: Route) => {
    Alert.alert('Borrar ruta planificada', `¿Eliminar "${route.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar', style: 'destructive',
        onPress: async () => {
          try { await routeRepository.delete(route.id); load(); showToast('Ruta planificada borrada.', 'success'); }
          catch { showToast('No se pudo borrar.', 'error'); }
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Header */}
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '800', flex: 1 }}>Rutas planificadas</Text>
        <TouchableOpacity onPress={() => router.push('/routes/plan')} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="add" size={24} color="#0D1B12" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.accent} /></View>
      ) : routes.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 14 }}>
          <Ionicons name="git-branch-outline" size={48} color={colors.textMuted} />
          <Text style={{ color: colors.textSecondary, fontSize: 15, textAlign: 'center' }}>Aún no tienes rutas planificadas.</Text>
          <TouchableOpacity onPress={() => router.push('/routes/plan')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.accent, paddingHorizontal: 20, height: 46, borderRadius: 23 }}>
            <Ionicons name="map-outline" size={18} color="#0D1B12" />
            <Text style={{ color: '#0D1B12', fontSize: 15, fontWeight: '700' }}>Planificar una ruta</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24, gap: 12 }}>
          {routes.map((r) => (
            <View key={r.id} style={{ backgroundColor: colors.bgCard, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border, gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="git-branch-outline" size={20} color={colors.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '700' }} numberOfLines={1}>{r.name}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>{formatDistance(r.distanceMeters)} estimados</Text>
                </View>
                <TouchableOpacity onPress={() => confirmDelete(r)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="trash-outline" size={20} color={colors.danger} />
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity onPress={() => router.push(`/routes/plan?edit=${r.id}`)}
                  style={{ flex: 1, height: 44, borderRadius: 12, backgroundColor: colors.bgElevated, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <Ionicons name="create-outline" size={18} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>Editar</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => router.push(`/tracking/pre-recording?followFrom=${r.id}`)}
                  style={{ flex: 1.2, height: 44, borderRadius: 12, backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <Ionicons name="navigate" size={18} color="#0D1B12" />
                  <Text style={{ color: '#0D1B12', fontSize: 14, fontWeight: '700' }}>Seguir</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
