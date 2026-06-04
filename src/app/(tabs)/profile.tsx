import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@infrastructure/supabase/supabaseClient';
import { routeRepository } from '@infrastructure/repositories/RouteRepositoryImpl';
import { useAuthStore } from '@presentation/stores/authStore';
import { useRoutesStore } from '@presentation/stores/routesStore';
import { usePersonalMetrics } from '@presentation/hooks/usePersonalMetrics';
import PersonalHeatmap from '@presentation/components/routes/PersonalHeatmap';
import { formatDistance, formatDuration, formatElevation } from '@shared/utils/formatters';
import { colors } from '@presentation/theme/colors';

export default function ProfileScreen() {
  const { user } = useAuthStore();
  const { routes } = useRoutesStore();
  const { records, recap } = usePersonalMetrics('year');
  const [loggingOut, setLoggingOut] = useState(false);
  const [polylines, setPolylines] = useState<[number, number][][]>([]);

  useEffect(() => {
    if (!user?.id) return;
    routeRepository.getAllTrackPolylines(user.id).then(setPolylines).catch(() => {});
  }, [user?.id, routes.length]);

  const unsyncedCount = routes.filter((r) => !r.isSynced).length;

  const recordCards = [
    { icon: 'navigate-outline', label: 'Ruta más larga', value: records.longestDistance ? formatDistance(records.longestDistance.value) : '—' },
    { icon: 'trending-up-outline', label: 'Mayor desnivel', value: records.maxElevationGain ? formatElevation(records.maxElevationGain.value, false) : '—' },
    { icon: 'flame-outline', label: 'Racha', value: records.streakDays > 0 ? `${records.streakDays} día${records.streakDays > 1 ? 's' : ''}` : '—' },
  ];

  const recapNums = [
    { value: formatDistance(recap.distanceMeters), label: 'Distancia' },
    { value: formatElevation(recap.elevationGainMeters, false), label: 'Desnivel' },
    { value: String(recap.routeCount), label: 'Rutas' },
  ];

  const handleLogout = () => {
    Alert.alert('Cerrar sesión', '¿Estás seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar sesión', style: 'destructive',
        onPress: async () => {
          setLoggingOut(true);
          await supabase.auth.signOut();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  const sectionLabel = (txt: string) => (
    <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '600', letterSpacing: 1, marginBottom: 10 }}>
      {txt}
    </Text>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text style={{ color: colors.textPrimary, fontSize: 22, fontWeight: '700', marginBottom: 24 }}>Perfil</Text>

        {/* Identidad */}
        <View style={{ alignItems: 'center', marginBottom: 28 }}>
          <View style={{
            width: 80, height: 80, borderRadius: 40, backgroundColor: colors.bgCard,
            borderWidth: 2, borderColor: colors.accent, justifyContent: 'center', alignItems: 'center',
          }}>
            <Ionicons name="person" size={40} color={colors.accent} />
          </View>
          <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '600', marginTop: 12 }}>
            {user?.fullName ?? 'Usuario'}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 4 }}>
            {records.totalRoutes} ruta{records.totalRoutes === 1 ? '' : 's'} · {formatDistance(records.totalDistanceMeters)} · {formatDuration(records.totalMovingSeconds)}
          </Text>
        </View>

        {/* Récords personales */}
        {sectionLabel('RÉCORDS PERSONALES')}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 24 }}>
          {recordCards.map((c) => (
            <View key={c.label} style={{
              flex: 1, backgroundColor: colors.bgCard, borderRadius: 12, padding: 14,
              borderWidth: 1, borderColor: colors.border, gap: 6,
            }}>
              <Ionicons name={c.icon as any} size={18} color={colors.accent} />
              <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '800' }}>{c.value}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 10 }}>{c.label}</Text>
            </View>
          ))}
        </View>

        {/* Mapa de calor personal */}
        {sectionLabel('MAPA DE CALOR PERSONAL')}
        <View style={{
          height: 200, borderRadius: 14, overflow: 'hidden', marginBottom: 24,
          borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCard,
          justifyContent: 'center', alignItems: 'center',
        }}>
          {polylines.length > 0 ? (
            <PersonalHeatmap polylines={polylines} />
          ) : (
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>Aún no hay rutas para el mapa de calor.</Text>
          )}
          {polylines.length > 0 && (
            <View pointerEvents="none" style={{
              position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', gap: 6,
              backgroundColor: '#0D1B12CC', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
              borderWidth: 1, borderColor: '#2D6A4F80',
            }}>
              <Ionicons name="flame" size={14} color={colors.accent} />
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{polylines.length} rutas registradas</Text>
            </View>
          )}
        </View>

        {/* Resumen del año */}
        {sectionLabel(`RESUMEN ${recap.year}`)}
        <View style={{
          backgroundColor: colors.accentSoft, borderRadius: 16, padding: 18, marginBottom: 24,
          borderWidth: 1, borderColor: colors.accent, gap: 14,
        }}>
          <View style={{ flexDirection: 'row' }}>
            {recapNums.map((n) => (
              <View key={n.label} style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: colors.accent, fontSize: 20, fontWeight: '800' }}>{n.value}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 11 }}>{n.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Ver progreso detallado */}
        <TouchableOpacity
          onPress={() => router.push('/metrics/progress')}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            backgroundColor: colors.bgCard, borderRadius: 12, padding: 16,
            borderWidth: 1, borderColor: colors.accent + '60', marginBottom: 24,
          }}
        >
          <Ionicons name="stats-chart-outline" size={22} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '600' }}>Ver progreso</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>Tendencias por semana, mes y año</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </TouchableOpacity>

        {/* Lugares / zonas */}
        <TouchableOpacity
          onPress={() => router.push('/metrics/places')}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            backgroundColor: colors.bgCard, borderRadius: 12, padding: 16,
            borderWidth: 1, borderColor: colors.accent + '60', marginBottom: 24,
          }}
        >
          <Ionicons name="map-outline" size={22} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '600' }}>Lugares y zonas</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>Dónde vas más y lugares más visitados</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </TouchableOpacity>

        {/* Mapas offline */}
        <TouchableOpacity
          onPress={() => router.push('/map-offline')}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            backgroundColor: colors.bgCard, borderRadius: 12, padding: 16,
            borderWidth: 1, borderColor: colors.accent + '60', marginBottom: 24,
          }}
        >
          <Ionicons name="cloud-download-outline" size={22} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '600' }}>Mapas offline</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>Descarga zonas para usar sin señal</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </TouchableOpacity>

        {/* Planificar ruta */}
        <TouchableOpacity
          onPress={() => router.push('/routes/plan')}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            backgroundColor: colors.bgCard, borderRadius: 12, padding: 16,
            borderWidth: 1, borderColor: colors.accent + '60', marginBottom: 24,
          }}
        >
          <Ionicons name="git-branch-outline" size={22} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '600' }}>Planificar ruta</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>Dibuja una ruta en el mapa y síguela</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </TouchableOpacity>

        {/* Sincronización */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 12,
          backgroundColor: colors.bgCard, borderRadius: 12, padding: 16,
          borderWidth: 1, borderColor: unsyncedCount > 0 ? '#F59E0B60' : '#22C55E40', marginBottom: 24,
        }}>
          <Ionicons
            name={unsyncedCount > 0 ? 'cloud-upload-outline' : 'cloud-done-outline'}
            size={22} color={unsyncedCount > 0 ? colors.accent : colors.success}
          />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '600' }}>
              {unsyncedCount > 0 ? `${unsyncedCount} ruta${unsyncedCount > 1 ? 's' : ''} sin sincronizar` : 'Todo sincronizado'}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
              {unsyncedCount > 0 ? 'Sincroniza desde Inicio antes de borrar la app.' : 'Tus rutas están respaldadas en la nube.'}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={handleLogout}
          disabled={loggingOut}
          style={{
            borderColor: '#EF4444', borderWidth: 1.5, borderRadius: 12, paddingVertical: 14,
            alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
            opacity: loggingOut ? 0.6 : 1,
          }}
        >
          {loggingOut ? (
            <ActivityIndicator size="small" color="#EF4444" />
          ) : (
            <Text style={{ color: '#EF4444', fontSize: 16, fontWeight: '600' }}>Cerrar sesión</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
