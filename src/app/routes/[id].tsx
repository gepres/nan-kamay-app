import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, SafeAreaView,
  TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Route } from '@core/entities/Route';
import { GpsPoint } from '@core/entities/GpsPoint';
import { Waypoint } from '@core/entities/Waypoint';
import { routeRepository } from '@infrastructure/repositories/RouteRepositoryImpl';
import { DifficultyLabel } from '@core/value-objects/Difficulty';
import { formatDistance, formatDuration, formatSpeed, formatElevation, formatDate } from '@shared/utils/formatters';
import ExportButtons from '@presentation/components/routes/ExportButtons';
import ElevationChart from '@presentation/components/routes/ElevationChart';
import RouteMap from '@presentation/components/map/RouteMap';
import { useRoutesStore } from '@presentation/stores/routesStore';
import { useAuthStore } from '@presentation/stores/authStore';

import { colors } from '@presentation/theme/colors';
const difficultyColors = { easy: colors.easy, moderate: colors.medium, hard: colors.hard };

export default function RouteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { deleteRoute } = useRoutesStore();
  const { user } = useAuthStore();

  const [route, setRoute] = useState<Route | null>(null);
  const [gpsPoints, setGpsPoints] = useState<GpsPoint[]>([]);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
    }).finally(() => setIsLoading(false));
  }, [id]);

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
        <ActivityIndicator color=colors.accent size="large" />
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
          <Ionicons name="arrow-back" size={24} color=colors.textPrimary />
        </TouchableOpacity>
        <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '700', flex: 1 }} numberOfLines={1}>
          {route.name}
        </Text>
        <TouchableOpacity onPress={handleDelete}>
          <Ionicons name="trash-outline" size={20} color="#EF4444" />
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
          {!route.isSynced && (
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
              <Ionicons name={s.icon as any} size={18} color=colors.accent />
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

        {/* Perfil de elevación */}
        {gpsPoints.some((p) => p.altitude != null) && (
          <View style={{
            backgroundColor: colors.bgCard, borderRadius: 12, padding: 14,
            borderWidth: 1, borderColor: '#2D6A4F', marginBottom: 16,
          }}>
            <ElevationChart gpsPoints={gpsPoints} height={80} />
          </View>
        )}

        {/* GPS points info */}
        <View style={{
          backgroundColor: colors.bgCard, borderRadius: 10, padding: 14,
          borderWidth: 1, borderColor: '#2D6A4F',
          flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16,
        }}>
          <Ionicons name="location-outline" size={18} color=colors.accent />
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
              <View key={wp.id} style={{
                backgroundColor: colors.bgCard, borderRadius: 10, padding: 14,
                marginBottom: 8, borderWidth: 1, borderColor: '#2D6A4F',
                flexDirection: 'row', alignItems: 'flex-start', gap: 12,
              }}>
                <Ionicons name="flag" size={16} color="#F59E0B" style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>{wp.title}</Text>
                  {wp.description ? (
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{wp.description}</Text>
                  ) : null}
                  {wp.imageUris.length > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                      <Ionicons name="image-outline" size={12} color=colors.textMuted />
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

        {/* Exportar */}
        <View style={{
          backgroundColor: colors.bgCard, borderRadius: 12, padding: 16,
          borderWidth: 1, borderColor: '#2D6A4F',
        }}>
          <ExportButtons routeId={route.id} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
