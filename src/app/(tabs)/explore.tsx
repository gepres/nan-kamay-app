import { useEffect, useState, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, FlatList,
  RefreshControl, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@presentation/stores/authStore';
import { useUiStore } from '@presentation/stores/uiStore';
import { getPublicRoutesUseCase, getPublicElevationProfiles, PublicRoute } from '@application/routes/GetPublicRoutesUseCase';
import { DifficultyLabel } from '@core/value-objects/Difficulty';
import { formatDistance, formatDuration, formatElevation } from '@shared/utils/formatters';
import { colors } from '@presentation/theme/colors';
import ElevationSparkline from '@presentation/components/routes/ElevationSparkline';

const DIFF_COLORS: Record<string, string> = { easy: colors.easy, moderate: colors.medium, hard: colors.hard, very_hard: colors.veryHard, expert: colors.expert };

function PubStat({ icon, value }: { icon: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <Ionicons name={icon as any} size={14} color={colors.accent} />
      <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>{value}</Text>
    </View>
  );
}

function PublicRouteCard({ route, isOwn, profile }: { route: PublicRoute; isOwn?: boolean; profile?: number[] }) {
  const diffColor = DIFF_COLORS[route.difficulty];
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => router.push(`/routes/public/${route.id}`)}
      style={{
        backgroundColor: colors.bgCard,
        borderRadius: 16,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: 'hidden',
      }}
    >
      <View style={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10, gap: 10 }}>
        {/* Nombre + (Tuya) + dificultad */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text
            style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '700', flex: 1 }}
            numberOfLines={1}
          >
            {route.name}
          </Text>

          {isOwn && (
            <View style={{
              backgroundColor: colors.accent + '20',
              borderRadius: 8,
              paddingHorizontal: 9,
              paddingVertical: 4,
            }}>
              <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '700' }}>Tuya</Text>
            </View>
          )}

          <View style={{
            backgroundColor: diffColor + '20',
            borderRadius: 8,
            paddingHorizontal: 9,
            paddingVertical: 4,
          }}>
            <Text style={{ color: diffColor, fontSize: 11, fontWeight: '700', letterSpacing: 0.3 }}>
              {DifficultyLabel[route.difficulty]}
            </Text>
          </View>
        </View>

        {route.description ? (
          <Text style={{ color: colors.textMuted, fontSize: 13 }} numberOfLines={1}>
            {route.description}
          </Text>
        ) : null}

        {/* Stats clave en línea */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
          <PubStat icon="navigate-outline" value={formatDistance(route.distanceMeters)} />
          <PubStat icon="time-outline" value={formatDuration(route.durationSeconds)} />
          <PubStat icon="trending-up-outline" value={formatElevation(route.elevationGainMeters)} />
        </View>
      </View>

      {/* Firma de elevación al pie */}
      {profile && <ElevationSparkline data={profile} height={44} />}
    </TouchableOpacity>
  );
}

export default function ExploreScreen() {
  const { user } = useAuthStore();
  const { isOffline, showToast } = useUiStore();
  const [routes, setRoutes] = useState<PublicRoute[]>([]);
  const [profiles, setProfiles] = useState<Record<string, number[]>>({});
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user || isOffline) return;
    setIsLoading(true);
    try {
      const data = await getPublicRoutesUseCase(user.id);
      setRoutes(data);
      // Firmas de elevación (no bloquea el render de la lista).
      getPublicElevationProfiles(data.map((r) => r.id))
        .then(setProfiles)
        .catch(() => { /* sin firma si falla */ });
    } catch (err) {
      showToast('Error al cargar rutas públicas', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, isOffline]);

  useEffect(() => {
    load();
  }, [load]); // load = useCallback([user?.id, isOffline]) → recarga al loguear / reconectar

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0D1B12' }}>
      {/* Header */}
      <View style={{
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <View>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>Descubre</Text>
          <Text style={{ color: colors.textPrimary, fontSize: 22, fontWeight: '700' }}>Explorar</Text>
        </View>
        <TouchableOpacity
          onPress={load}
          disabled={isLoading || isOffline}
          style={{
            width: 36, height: 36,
            borderRadius: 18,
            backgroundColor: colors.bgCard,
            borderWidth: 1,
            borderColor: '#2D6A4F',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Ionicons name="refresh-outline" size={18} color={isOffline ? '#2D6A4F' : colors.accent} />
        </TouchableOpacity>
      </View>

      {/* Offline banner */}
      {isOffline && (
        <View style={{
          backgroundColor: '#F59E0B',
          paddingVertical: 6,
          paddingHorizontal: 16,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          marginBottom: 8,
        }}>
          <Ionicons name="cloud-offline-outline" size={14} color="#0D1B12" />
          <Text style={{ color: '#0D1B12', fontSize: 12, fontWeight: '600' }}>
            Sin conexión — explorar requiere internet
          </Text>
        </View>
      )}

      <FlatList
        data={routes}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={load}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
        ListHeaderComponent={
          routes.length > 0 ? (
            <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600', marginBottom: 12 }}>
              {routes.length} ruta{routes.length !== 1 ? 's' : ''} públicas
            </Text>
          ) : null
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={{ alignItems: 'center', paddingVertical: 60 }}>
              <ActivityIndicator color={colors.accent} size="large" />
            </View>
          ) : isOffline ? (
            <View style={{ alignItems: 'center', paddingVertical: 60 }}>
              <Ionicons name="wifi-outline" size={56} color="#2D6A4F" />
              <Text style={{ color: colors.textMuted, marginTop: 12, textAlign: 'center' }}>
                Conéctate a internet{'\n'}para explorar rutas de otros usuarios.
              </Text>
            </View>
          ) : (
            <View style={{ alignItems: 'center', paddingVertical: 60 }}>
              <Ionicons name="compass-outline" size={56} color="#2D6A4F" />
              <Text style={{ color: colors.textMuted, marginTop: 12, textAlign: 'center', lineHeight: 22 }}>
                Aún no hay rutas públicas.{'\n'}¡Sé el primero en compartir la tuya!
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => <PublicRouteCard route={item} isOwn={item.userId === user?.id} profile={profiles[item.id]} />}
      />
    </SafeAreaView>
  );
}
