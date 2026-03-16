import { useState } from 'react';
import {
  View, Text, TouchableOpacity, SafeAreaView,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTrackingStore } from '@presentation/stores/trackingStore';
import { useAuthStore } from '@presentation/stores/authStore';
import { useRoutesStore } from '@presentation/stores/routesStore';
import ExportButtons from '@presentation/components/routes/ExportButtons';
import ElevationChart from '@presentation/components/routes/ElevationChart';
import { useUiStore } from '@presentation/stores/uiStore';
import { saveRouteUseCase } from '@application/tracking/SaveRouteUseCase';
import { syncOfflineRoutesUseCase } from '@application/routes/SyncOfflineRoutesUseCase';
import { formatDistance, formatDuration, formatSpeed, formatElevation } from '@shared/utils/formatters';
import { colors } from '@presentation/theme/colors';

export default function SummaryScreen() {
  const { routeId, routeName, routeDescription, activityType, difficulty, liveStats, gpsPoints, waypoints, startedAt, reset } =
    useTrackingStore();
  const { user } = useAuthStore();
  const { addRoute, fetchRoutes } = useRoutesStore();
  const { showToast, isOffline } = useUiStore();

  const [isSaving, setIsSaving] = useState(false);
  const [savedRouteId, setSavedRouteId] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(false);

  const handleSave = async () => {
    if (!routeId || !user || !startedAt) return;
    setIsSaving(true);
    try {
      const { route } = await saveRouteUseCase({
        routeId,
        userId: user.id,
        name: routeName,
        description: routeDescription || undefined,
        activityType: activityType || undefined,
        difficulty,
        gpsPoints,
        waypoints,
        stats: { ...liveStats },
        startedAt,
        finishedAt: new Date(),
        isPublic,
      });

      addRoute(route);
      setSavedRouteId(route.id);

      // Intentar sincronizar si hay conexión
      if (!isOffline) {
        syncOfflineRoutesUseCase(user.id)
          .then((result) => {
            if (result.synced > 0) fetchRoutes(user.id);
          })
          .catch(console.error);
      } else {
        showToast('Ruta guardada localmente. Se sincronizará cuando haya conexión.', 'info');
      }

      showToast('¡Ruta guardada! Puedes exportarla antes de salir.', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al guardar la ruta.';
      showToast(msg, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscard = () => {
    Alert.alert('Descartar ruta', '¿Seguro que deseas descartar esta ruta?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Descartar',
        style: 'destructive',
        onPress: () => { reset(); router.replace('/(tabs)'); },
      },
    ]);
  };

  const stats = [
    { icon: 'navigate-outline',   label: 'Distancia',    value: formatDistance(liveStats.distanceMeters) },
    { icon: 'time-outline',        label: 'Duración',     value: formatDuration(liveStats.durationSeconds) },
    { icon: 'speedometer-outline', label: 'Vel. Promedio',value: formatSpeed(liveStats.avgSpeedKmh) },
    { icon: 'flash-outline',       label: 'Vel. Máxima',  value: formatSpeed(liveStats.maxSpeedKmh) },
    { icon: 'arrow-up-outline',    label: 'Subida',       value: formatElevation(liveStats.elevationGainMeters) },
    { icon: 'arrow-down-outline',  label: 'Bajada',       value: formatElevation(liveStats.elevationLossMeters) },
    { icon: 'trending-up-outline', label: 'Elev. máx.',   value: formatElevation(liveStats.maxElevationMeters, false) },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0D1B12' }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 48 }}>
        {/* Header */}
        <View style={{ paddingTop: 24, marginBottom: 28 }}>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>Ruta completada</Text>
          <Text style={{ color: colors.textPrimary, fontSize: 24, fontWeight: '700', marginTop: 4 }}>
            {routeName}
          </Text>
          {isOffline && (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              marginTop: 8, backgroundColor: '#F59E0B15',
              borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
              alignSelf: 'flex-start',
            }}>
              <Ionicons name="cloud-offline-outline" size={14} color="#F59E0B" />
              <Text style={{ color: '#F59E0B', fontSize: 12 }}>Sin conexión — se guardará localmente</Text>
            </View>
          )}
        </View>

        {/* Grid stats */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 28 }}>
          {stats.map((s) => (
            <View key={s.label} style={{
              width: '47%',
              backgroundColor: colors.bgCard,
              borderRadius: 12,
              padding: 16,
              borderWidth: 1,
              borderColor: '#2D6A4F',
            }}>
              <Ionicons name={s.icon as any} size={20} color={colors.accent} />
              <Text style={{ color: colors.textPrimary, fontSize: 20, fontWeight: '700', marginTop: 8 }}>
                {s.value}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Perfil de elevación */}
        {gpsPoints.some((p) => p.altitude != null) && (
          <View style={{
            backgroundColor: colors.bgCard, borderRadius: 12, padding: 14,
            borderWidth: 1, borderColor: '#2D6A4F', marginBottom: 16,
          }}>
            <ElevationChart gpsPoints={gpsPoints} height={80} />
          </View>
        )}

        {/* Puntos GPS grabados */}
        <View style={{
          backgroundColor: colors.bgCard, borderRadius: 10, padding: 14,
          borderWidth: 1, borderColor: '#2D6A4F',
          flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16,
        }}>
          <Ionicons name="location-outline" size={18} color={colors.accent} />
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>
            <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>{gpsPoints.length}</Text>
            {' '}puntos GPS grabados
          </Text>
        </View>

        {/* Waypoints */}
        {waypoints.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600', marginBottom: 10 }}>
              Waypoints ({waypoints.length})
            </Text>
            {waypoints.map((wp) => (
              <View key={wp.id} style={{
                backgroundColor: colors.bgCard, borderRadius: 10, padding: 14,
                marginBottom: 8, borderWidth: 1, borderColor: '#2D6A4F',
                flexDirection: 'row', alignItems: 'flex-start', gap: 12,
              }}>
                <Ionicons name="flag" size={16} color="#F59E0B" style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>{wp.title}</Text>
                  {wp.description ? (
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                      {wp.description}
                    </Text>
                  ) : null}
                  {wp.imageUris.length > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                      <Ionicons name="image-outline" size={13} color={colors.textMuted} />
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                        {wp.imageUris.length} foto{wp.imageUris.length > 1 ? 's' : ''}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Exportar — solo disponible después de guardar */}
        {savedRouteId && (
          <View style={{
            backgroundColor: colors.bgCard, borderRadius: 12, padding: 16,
            borderWidth: 1, borderColor: '#2D6A4F', marginBottom: 24,
          }}>
            <ExportButtons routeId={savedRouteId} />
          </View>
        )}

        {/* Toggle público — solo antes de guardar */}
        {!savedRouteId && (
          <TouchableOpacity
            onPress={() => setIsPublic((v) => !v)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              backgroundColor: colors.bgCard,
              borderRadius: 12,
              padding: 14,
              borderWidth: 1,
              borderColor: isPublic ? colors.accent + '60' : colors.border,
              marginBottom: 16,
            }}
          >
            <View style={{
              width: 22, height: 22, borderRadius: 11,
              backgroundColor: isPublic ? colors.accent : '#0D1B12',
              borderWidth: 2,
              borderColor: isPublic ? colors.accent : '#2D6A4F',
              justifyContent: 'center',
              alignItems: 'center',
            }}>
              {isPublic && <Ionicons name="checkmark" size={13} color="#0D1B12" />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '600' }}>
                Hacer ruta pública
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                Visible para otros usuarios en Explorar
              </Text>
            </View>
            <Ionicons name="globe-outline" size={18} color={isPublic ? colors.accent : '#2D6A4F'} />
          </TouchableOpacity>
        )}

        {/* Botones */}
        {savedRouteId ? (
          <TouchableOpacity
            onPress={() => { reset(); router.replace('/(tabs)'); }}
            style={{
              backgroundColor: colors.accent,
              borderRadius: 12,
              paddingVertical: 16,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <Ionicons name="home-outline" size={20} color="#0D1B12" />
            <Text style={{ color: '#0D1B12', fontSize: 16, fontWeight: '700' }}>
              Ir al inicio
            </Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity
              onPress={handleSave}
              disabled={isSaving}
              style={{
                backgroundColor: colors.accent,
                borderRadius: 12,
                paddingVertical: 16,
                alignItems: 'center',
                marginBottom: 14,
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              {isSaving ? (
                <ActivityIndicator color="#0D1B12" />
              ) : (
                <>
                  <Ionicons name="save-outline" size={20} color="#0D1B12" />
                  <Text style={{ color: '#0D1B12', fontSize: 16, fontWeight: '700' }}>
                    Guardar ruta
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={handleDiscard} disabled={isSaving}>
              <Text style={{ color: '#EF4444', textAlign: 'center', fontSize: 15, fontWeight: '500' }}>
                Descartar
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
