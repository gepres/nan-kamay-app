import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView,
  TouchableOpacity, ActivityIndicator, Alert, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Route } from '@core/entities/Route';
import { GpsPoint } from '@core/entities/GpsPoint';
import { Waypoint } from '@core/entities/Waypoint';
import { routeRepository } from '@infrastructure/repositories/RouteRepositoryImpl';
import { DifficultyLabel } from '@core/value-objects/Difficulty';
import { formatDistance, formatDuration, formatSpeed, formatElevation, formatDate } from '@shared/utils/formatters';
import ExportButtons from '@presentation/components/routes/ExportButtons';
import ElevationChart from '@presentation/components/routes/ElevationChart';
import WaypointDetailCard from '@presentation/components/routes/WaypointDetailCard';
import RouteMap from '@presentation/components/map/RouteMap';
import { useRoutesStore } from '@presentation/stores/routesStore';
import { useAuthStore } from '@presentation/stores/authStore';
import { useUiStore } from '@presentation/stores/uiStore';
import { syncRouteUseCase } from '@application/routes/SyncRouteUseCase';
import { setRoutePublicUseCase } from '@application/routes/SetRoutePublicUseCase';
import { refineElevationUseCase } from '@application/routes/RefineElevationUseCase';

import { colors } from '@presentation/theme/colors';
const difficultyColors: Record<string, string> = { easy: colors.easy, moderate: colors.medium, hard: colors.hard, very_hard: colors.veryHard, expert: colors.expert };

export default function RouteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { deleteRoute, fetchRoutes } = useRoutesStore();
  const { user } = useAuthStore();
  const { showToast, isOffline } = useUiStore();

  const [route, setRoute] = useState<Route | null>(null);
  const [gpsPoints, setGpsPoints] = useState<GpsPoint[]>([]);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Estado de nube: visibilidad pública + sincronización por-ruta.
  const [isPublic, setIsPublic] = useState(false);
  const [togglingPublic, setTogglingPublic] = useState(false);
  type SyncState = 'idle' | 'syncing' | 'synced' | 'error';
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [refining, setRefining] = useState(false);

  const reloadRoute = async () => {
    if (!id) return;
    const [rt, gps, wps] = await Promise.all([
      routeRepository.getById(id),
      routeRepository.getGpsPoints(id),
      routeRepository.getWaypoints(id),
    ]);
    setRoute(rt);
    setGpsPoints(gps);
    setWaypoints(wps);
    if (rt) {
      setIsPublic(rt.isPublic);
      setSyncState(rt.isSynced ? 'synced' : 'idle');
    }
  };

  const handleRefineElevation = async () => {
    if (!id || refining) return;
    if (isOffline) {
      showToast('Sin conexión. El ajuste por terreno necesita internet.', 'info');
      return;
    }
    setRefining(true);
    showToast('Ajustando elevación con el terreno… puede tardar unos segundos.', 'info');
    try {
      const r = await refineElevationUseCase(id);
      await reloadRoute();
      if (user) fetchRoutes(user.id);
      showToast(`Elevación ajustada con el terreno (${r.updatedPoints} puntos).`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo ajustar la elevación.', 'error');
    } finally {
      setRefining(false);
    }
  };

  // Recargar al volver al detalle (p. ej. tras editar la metadata).
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) { firstFocus.current = false; return; }
      reloadRoute();
    }, [id])
  );

  useEffect(() => {
    if (!id) return;
    Promise.all([
      routeRepository.getById(id),
      routeRepository.getGpsPoints(id),
      routeRepository.getWaypoints(id),
    ]).then(([r, gps, wps]) => {
      setRoute(r);
      setGpsPoints(gps);
      setWaypoints(wps);
      if (r) {
        setIsPublic(r.isPublic);
        setSyncState(r.isSynced ? 'synced' : 'idle');
      }
    }).finally(() => setIsLoading(false));
  }, [id]);

  const handleSync = async () => {
    if (!id || !user || syncState === 'syncing') return;
    if (isOffline) {
      showToast('Sin conexión. Conéctate para subir la ruta.', 'info');
      return;
    }
    setSyncState('syncing');
    try {
      await syncRouteUseCase(id, user.id);
      setSyncState('synced');
      fetchRoutes(user.id);
      showToast('Ruta, waypoints e imágenes subidos a la nube.', 'success');
    } catch (err) {
      setSyncState('error');
      showToast(err instanceof Error ? err.message : 'Error al subir la ruta.', 'error');
    }
  };

  const handleTogglePublic = async (value: boolean) => {
    if (!id || togglingPublic) return;
    setTogglingPublic(true);
    setIsPublic(value); // optimista
    try {
      await setRoutePublicUseCase(id, value);
      if (user) fetchRoutes(user.id);
      showToast(value ? 'Ruta ahora es pública.' : 'Ruta ahora es privada.', 'success');
    } catch (err) {
      setIsPublic(!value); // revertir
      showToast(err instanceof Error ? err.message : 'No se pudo cambiar la visibilidad.', 'error');
    } finally {
      setTogglingPublic(false);
    }
  };

  const handleDelete = () => {
    Alert.alert('Eliminar ruta', `¿Eliminar "${route?.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          await deleteRoute(id!);
          router.back();
        },
      },
    ]);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0D1B12', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={colors.accent} size="large" />
      </SafeAreaView>
    );
  }

  if (!route) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0D1B12', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: colors.textMuted }}>Ruta no encontrada.</Text>
      </SafeAreaView>
    );
  }

  const diffColor = difficultyColors[route.difficulty];

  const stats = [
    { icon: 'navigate-outline',   label: 'Distancia',    value: formatDistance(route.distanceMeters) },
    { icon: 'time-outline',        label: 'Duración',     value: formatDuration(route.durationSeconds) },
    { icon: 'speedometer-outline', label: 'Vel. Prom.',   value: formatSpeed(route.avgSpeedKmh) },
    { icon: 'flash-outline',       label: 'Vel. Máx.',    value: formatSpeed(route.maxSpeedKmh) },
    { icon: 'arrow-up-outline',    label: 'Subida',       value: formatElevation(route.elevationGainMeters) },
    { icon: 'arrow-down-outline',  label: 'Bajada',       value: formatElevation(route.elevationLossMeters) },
    { icon: 'trending-up-outline', label: 'Elev. máx.',   value: formatElevation(route.maxElevationMeters, false) },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0D1B12' }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, gap: 12,
      }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '700', flex: 1 }} numberOfLines={1}>
          {route.name}
        </Text>
        <TouchableOpacity
          onPress={() => router.push(`/routes/edit/${route.id}`)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{
            width: 38, height: 38, borderRadius: 19,
            backgroundColor: colors.bgCard,
            borderWidth: 1, borderColor: colors.border,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Ionicons name="create-outline" size={19} color={colors.accent} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
        {/* Meta */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20, marginTop: 8 }}>
          <View style={{
            backgroundColor: diffColor + '20', borderRadius: 6,
            paddingHorizontal: 10, paddingVertical: 4,
            borderWidth: 1, borderColor: diffColor + '60',
          }}>
            <Text style={{ color: diffColor, fontSize: 12, fontWeight: '700' }}>
              {DifficultyLabel[route.difficulty]}
            </Text>
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>{formatDate(route.startedAt)}</Text>
          {syncState !== 'synced' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#F59E0B' }} />
              <Text style={{ color: '#F59E0B', fontSize: 12 }}>Sin sincronizar</Text>
            </View>
          )}
        </View>

        {/* Stats grid */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
          {stats.map((s) => (
            <View key={s.label} style={{
              width: '47%', backgroundColor: colors.bgCard,
              borderRadius: 12, padding: 14,
              borderWidth: 1, borderColor: '#2D6A4F',
            }}>
              <Ionicons name={s.icon as any} size={18} color={colors.accent} />
              <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '700', marginTop: 6 }}>
                {s.value}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 3 }}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Mapa de la ruta */}
        {gpsPoints.length > 1 && (
          <View style={{
            height: 220, borderRadius: 12, overflow: 'hidden',
            marginBottom: 16, borderWidth: 1, borderColor: '#2D6A4F',
          }}>
            <RouteMap gpsPoints={gpsPoints} waypoints={waypoints} />
          </View>
        )}

        {/* Acciones destacadas: Seguir ruta + Previsualizar */}
        {gpsPoints.length > 1 && (
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
            <TouchableOpacity
              onPress={() => router.push(`/tracking/pre-recording?followFrom=${route.id}`)}
              style={{
                flex: 1,
                backgroundColor: colors.accent,
                borderRadius: 12,
                paddingVertical: 14,
                paddingHorizontal: 12,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <Ionicons name="navigate" size={18} color="#0D1B12" />
              <Text style={{ color: '#0D1B12', fontWeight: '700', fontSize: 14 }}>
                Seguir ruta
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push(`/routes/replay/${route.id}`)}
              style={{
                flex: 1,
                backgroundColor: colors.bgCard,
                borderRadius: 12,
                paddingVertical: 14,
                paddingHorizontal: 12,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                borderWidth: 1,
                borderColor: colors.accent + '60',
              }}
            >
              <Ionicons name="film-outline" size={18} color={colors.accent} />
              <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 14 }}>
                Previsualizar
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Perfil de elevación */}
        {gpsPoints.some((p) => p.altitude != null) && (
          <View style={{
            backgroundColor: colors.bgCard, borderRadius: 12, padding: 14,
            borderWidth: 1, borderColor: '#2D6A4F', marginBottom: 16,
          }}>
            <ElevationChart gpsPoints={gpsPoints} height={80} />
          </View>
        )}

        {/* Ajustar elevación con el terreno (DEM) */}
        {gpsPoints.length > 1 && (
          <TouchableOpacity
            onPress={handleRefineElevation}
            disabled={refining || isOffline}
            style={{
              backgroundColor: colors.bgCard,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: '#2D6A4F',
              paddingVertical: 12,
              paddingHorizontal: 14,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              marginBottom: 16,
              opacity: isOffline ? 0.6 : 1,
            }}
          >
            {refining ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Ionicons name="trail-sign-outline" size={18} color={colors.accent} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '600' }}>
                Ajustar elevación con el terreno
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 1 }}>
                Usa el modelo de terreno (DEM) para una elevación más precisa
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {/* GPS points info */}
        <View style={{
          backgroundColor: colors.bgCard, borderRadius: 10, padding: 14,
          borderWidth: 1, borderColor: '#2D6A4F',
          flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16,
        }}>
          <Ionicons name="location-outline" size={18} color={colors.accent} />
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>
            <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>{gpsPoints.length}</Text>
            {' '}puntos GPS registrados
          </Text>
        </View>

        {/* Waypoints */}
        {waypoints.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600', marginBottom: 10 }}>
              Waypoints ({waypoints.length})
            </Text>
            {waypoints.map((wp) => (
              <WaypointDetailCard
                key={wp.id}
                wp={wp}
                onEdit={() => router.push(`/routes/edit-waypoint/${wp.id}`)}
              />
            ))}
          </View>
        )}

        {/* Nube: visibilidad pública + sincronización */}
        <View style={{
          backgroundColor: colors.bgCard, borderRadius: 12, padding: 16,
          borderWidth: 1,
          borderColor: syncState === 'synced' ? colors.success + '40'
            : syncState === 'error' ? colors.danger + '60' : '#2D6A4F',
          marginBottom: 16, gap: 14,
        }}>
          {/* Switch ruta pública */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Ionicons name="globe-outline" size={20} color={isPublic ? colors.accent : colors.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '600' }}>
                Ruta pública
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                Visible para otros usuarios en Explorar
              </Text>
            </View>
            <Switch
              value={isPublic}
              onValueChange={handleTogglePublic}
              disabled={togglingPublic}
              trackColor={{ false: '#2D6A4F', true: colors.accent }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={{ height: 1, backgroundColor: '#2D6A4F' }} />

          {/* Estado + botón de sync */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Ionicons
              name={syncState === 'synced' ? 'cloud-done-outline' : 'cloud-upload-outline'}
              size={20}
              color={syncState === 'synced' ? colors.success : colors.accent}
            />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '600' }}>
                {syncState === 'synced' ? 'Sincronizada' : 'Pendiente de subir'}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                {syncState === 'synced'
                  ? 'Ruta, waypoints e imágenes respaldados.'
                  : 'Sube la ruta con sus waypoints e imágenes.'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleSync}
              disabled={syncState === 'syncing'}
              style={{
                backgroundColor: syncState === 'synced' ? colors.bgElevated : colors.accent,
                borderRadius: 10,
                paddingVertical: 9,
                paddingHorizontal: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                minWidth: 96,
                justifyContent: 'center',
              }}
            >
              {syncState === 'syncing' ? (
                <ActivityIndicator color="#0D1B12" size="small" />
              ) : (
                <>
                  <Ionicons
                    name={syncState === 'synced' ? 'refresh' : 'cloud-upload-outline'}
                    size={15}
                    color={syncState === 'synced' ? colors.accent : '#0D1B12'}
                  />
                  <Text style={{
                    color: syncState === 'synced' ? colors.accent : '#0D1B12',
                    fontSize: 13, fontWeight: '700',
                  }}>
                    {syncState === 'synced' ? 'Re-subir' : syncState === 'error' ? 'Reintentar' : 'Subir'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Exportar */}
        <View style={{
          backgroundColor: colors.bgCard, borderRadius: 12, padding: 16,
          borderWidth: 1, borderColor: '#2D6A4F',
        }}>
          <ExportButtons routeId={route.id} />
        </View>

        {/* Eliminar ruta */}
        <TouchableOpacity
          onPress={handleDelete}
          style={{
            marginTop: 16,
            backgroundColor: colors.bgCard,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.danger,
            paddingVertical: 14,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <Ionicons name="trash-outline" size={18} color={colors.danger} />
          <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '600' }}>
            Eliminar Ruta
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
