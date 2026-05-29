import { useEffect, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, TouchableOpacity,
  FlatList, RefreshControl, Alert, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@presentation/stores/authStore';
import { useRoutesStore } from '@presentation/stores/routesStore';
import { useUiStore } from '@presentation/stores/uiStore';
import { useNetworkStatus } from '@presentation/hooks/useNetworkStatus';
import { useTrackingStore } from '@presentation/stores/trackingStore';
import { getRecoverableDraft, discardDraftRoute } from '@application/tracking/DraftRouteUseCase';
import RouteCard from '@presentation/components/routes/RouteCard';
import OfflineBanner from '@presentation/components/ui/OfflineBanner';
import { colors } from '@presentation/theme/colors';

export default function HomeScreen() {
  const { user } = useAuthStore();
  const { routes, isLoading, isSyncing, fetchRoutes, syncRoutes } = useRoutesStore();
  const { isOffline } = useUiStore();
  const { showToast } = useUiStore();

  // Monitorea red y actualiza uiStore
  useNetworkStatus();

  // Cargar rutas al montar
  useEffect(() => {
    if (user) fetchRoutes(user.id);
  }, [user?.id]);

  // Recuperación de grabación interrumpida (A3): si el proceso fue matado
  // durante una grabación, al abrir la app ofrecemos reanudar/finalizar.
  const recoveryChecked = useRef(false);
  useEffect(() => {
    if (!user || recoveryChecked.current) return;
    recoveryChecked.current = true;
    if (useTrackingStore.getState().status !== 'idle') return; // ya grabando
    getRecoverableDraft(user.id)
      .then((draft) => {
        if (!draft) return;
        const { route, gpsPoints, waypoints } = draft;
        const restore = () =>
          useTrackingStore.getState().restoreSession({
            routeId: route.id,
            routeName: route.name,
            routeDescription: route.description ?? '',
            activityType: route.activityType ?? 'Senderismo',
            difficulty: route.difficulty,
            startedAt: route.startedAt,
            gpsPoints,
            waypoints,
          });
        Alert.alert(
          'Grabación interrumpida',
          `Se recuperó "${route.name}" con ${gpsPoints.length} puntos GPS sin finalizar. ¿Qué deseas hacer?`,
          [
            {
              text: 'Descartar',
              style: 'destructive',
              onPress: () => {
                discardDraftRoute(route.id).catch((e) => console.error(e));
              },
            },
            {
              text: 'Finalizar',
              onPress: () => {
                restore();
                useTrackingStore.getState().finishRecording();
                router.replace('/tracking/summary');
              },
            },
            {
              text: 'Reanudar',
              onPress: () => {
                restore();
                router.replace('/tracking/active');
              },
            },
          ]
        );
      })
      .catch((e) => console.error('[draft] recuperación falló', e));
  }, [user?.id]);

  // Sync bidireccional (push + pull) al estar online / al entrar.
  useEffect(() => {
    if (isOffline || !user) return;
    syncRoutes(user.id)
      .then((result) => {
        if (result.synced > 0) {
          showToast(`${result.synced} ruta${result.synced > 1 ? 's' : ''} sincronizada${result.synced > 1 ? 's' : ''}`, 'success');
        }
        if (result.failed > 0) {
          showToast(
            `No se pudo sincronizar ${result.failed} ruta${result.failed > 1 ? 's' : ''}: ${result.errors[0] ?? 'error del servidor'}`,
            'error'
          );
        }
      })
      .catch((err) => {
        showToast(
          err instanceof Error ? err.message : 'Error de sincronización',
          'error'
        );
      });
  }, [isOffline, user?.id]);

  const handleManualSync = async () => {
    if (!user || isOffline) {
      showToast('Sin conexión. Conéctate a internet para sincronizar.', 'error');
      return;
    }
    const result = await syncRoutes(user.id);
    if (result.synced > 0) {
      showToast(`${result.synced} ruta${result.synced > 1 ? 's' : ''} sincronizada${result.synced > 1 ? 's' : ''}`, 'success');
    }
    if (result.failed > 0) {
      showToast(
        `No se pudo sincronizar ${result.failed} ruta${result.failed > 1 ? 's' : ''}: ${result.errors[0] ?? 'error del servidor'}`,
        'error'
      );
    } else if (result.synced === 0) {
      showToast('Todo sincronizado', 'success');
    }
  };

  const unsyncedCount = routes.filter((r) => !r.isSynced).length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      {/* Barra offline animada */}
      <OfflineBanner visible={isOffline} />

      {/* Header */}
      <View style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 16,
      }}>
        <View>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>
            {new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
          <Text style={{ color: colors.textPrimary, fontSize: 22, fontWeight: '700' }}>
            {user?.fullName?.split(' ')[0] ?? 'Trekker'}
          </Text>
        </View>

        {/* Botón sync manual */}
        {unsyncedCount > 0 && (
          <TouchableOpacity
            onPress={handleManualSync}
            disabled={isSyncing}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: '#F59E0B20',
              borderRadius: 20,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderWidth: 1,
              borderColor: '#F59E0B40',
            }}
          >
            {isSyncing ? (
              <ActivityIndicator size="small" color="#F59E0B" />
            ) : (
              <Ionicons name="cloud-upload-outline" size={16} color="#F59E0B" />
            )}
            <Text style={{ color: '#F59E0B', fontSize: 12, fontWeight: '600' }}>
              {unsyncedCount} sin sync
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Botón Iniciar Ruta */}
      <TouchableOpacity
        onPress={() => router.push('/tracking/pre-recording')}
        style={{
          marginHorizontal: 20,
          backgroundColor: colors.accent,
          borderRadius: 12,
          paddingVertical: 16,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          marginBottom: 24,
        }}
      >
        <Ionicons name="play-circle" size={24} color={colors.bgPrimary} />
        <Text style={{ color: colors.bgPrimary, fontSize: 16, fontWeight: '700' }}>
          Iniciar nueva ruta
        </Text>
      </TouchableOpacity>

      {/* Lista de rutas */}
      <FlatList
        data={routes}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => user && fetchRoutes(user.id)}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
        ListHeaderComponent={
          routes.length > 0 ? (
            <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '600', marginBottom: 12 }}>
              Mis rutas ({routes.length})
            </Text>
          ) : null
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={{ alignItems: 'center', paddingVertical: 60 }}>
              <ActivityIndicator color={colors.accent} size="large" />
            </View>
          ) : (
            <View style={{ alignItems: 'center', paddingVertical: 60 }}>
              <Ionicons name="map-outline" size={56} color="#2D6A4F" />
              <Text style={{ color: colors.textMuted, marginTop: 12, textAlign: 'center', lineHeight: 22 }}>
                Aún no tienes rutas grabadas.{'\n'}¡Inicia tu primera aventura!
              </Text>
            </View>
          )
        }
        renderItem={({ item, index }) => (
          <RouteCard
            route={item}
            index={index}
            onPress={() => router.push(`/routes/${item.id}`)}
          />
        )}
      />
    </SafeAreaView>
  );
}
