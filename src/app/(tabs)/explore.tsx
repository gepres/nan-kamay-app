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
import { getPublicRoutesUseCase, PublicRoute } from '@application/routes/GetPublicRoutesUseCase';
import { DifficultyLabel } from '@core/value-objects/Difficulty';
import { formatDistance, formatDuration, formatElevation, formatDate } from '@shared/utils/formatters';
import { colors } from '@presentation/theme/colors';

const DIFF_COLORS: Record<string, string> = { easy: colors.easy, moderate: colors.medium, hard: colors.hard, very_hard: colors.veryHard, expert: colors.expert };

function PublicRouteCard({ route }: { route: PublicRoute }) {
  const diffColor = DIFF_COLORS[route.difficulty];
  return (
    <View style={{
      backgroundColor: colors.bgCard,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: '#2D6A4F',
    }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <View style={{
          backgroundColor: diffColor + '20',
          borderRadius: 6,
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderWidth: 1,
          borderColor: diffColor + '60',
        }}>
          <Text style={{ color: diffColor, fontSize: 11, fontWeight: '700' }}>
            {DifficultyLabel[route.difficulty]}
          </Text>
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{formatDate(route.startedAt)}</Text>
      </View>

      <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '700', marginBottom: 4 }}>
        {route.name}
      </Text>
      {route.description ? (
        <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 10 }} numberOfLines={2}>
          {route.description}
        </Text>
      ) : null}

      {/* Stats chips */}
      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="navigate-outline" size={13} color={colors.accent} />
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>{formatDistance(route.distanceMeters)}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="time-outline" size={13} color={colors.accent} />
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>{formatDuration(route.durationSeconds)}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="trending-up-outline" size={13} color={colors.accent} />
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>{formatElevation(route.elevationGainMeters)}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="arrow-up-outline" size={13} color={colors.accent} />
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>{formatElevation(route.maxElevationMeters, false)} máx.</Text>
        </View>
      </View>
    </View>
  );
}

export default function ExploreScreen() {
  const { user } = useAuthStore();
  const { isOffline, showToast } = useUiStore();
  const [routes, setRoutes] = useState<PublicRoute[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user || isOffline) return;
    setIsLoading(true);
    try {
      const data = await getPublicRoutesUseCase(user.id);
      setRoutes(data);
    } catch (err) {
      showToast('Error al cargar rutas públicas', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, isOffline]);

  useEffect(() => {
    load();
  }, []);

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
        renderItem={({ item }) => <PublicRouteCard route={item} />}
      />
    </SafeAreaView>
  );
}
