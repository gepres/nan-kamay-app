import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Route } from '@core/entities/Route';
import { GpsPoint } from '@core/entities/GpsPoint';
import { Waypoint } from '@core/entities/Waypoint';
import { getPublicRouteDetailUseCase } from '@application/routes/GetPublicRouteDetailUseCase';
import { DifficultyLabel } from '@core/value-objects/Difficulty';
import { formatDistance, formatDuration, formatSpeed, formatElevation, formatDate } from '@shared/utils/formatters';
import ElevationChart from '@presentation/components/routes/ElevationChart';
import WaypointDetailCard from '@presentation/components/routes/WaypointDetailCard';
import RouteMap from '@presentation/components/map/RouteMap';
import { useUiStore } from '@presentation/stores/uiStore';
import { colors } from '@presentation/theme/colors';

const difficultyColors: Record<string, string> = { easy: colors.easy, moderate: colors.medium, hard: colors.hard, very_hard: colors.veryHard, expert: colors.expert };

export default function PublicRouteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { showToast } = useUiStore();

  const [route, setRoute] = useState<Route | null>(null);
  const [gpsPoints, setGpsPoints] = useState<GpsPoint[]>([]);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    getPublicRouteDetailUseCase(id)
      .then((detail) => {
        if (detail) {
          setRoute(detail.route);
          setGpsPoints(detail.gpsPoints);
          setWaypoints(detail.waypoints);
        }
      })
      .catch(() => showToast('Error al cargar la ruta pública', 'error'))
      .finally(() => setIsLoading(false));
  }, [id]);

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0D1B12', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={colors.accent} size="large" />
      </SafeAreaView>
    );
  }

  if (!route) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0D1B12', justifyContent: 'center', alignItems: 'center', gap: 16 }}>
        <Ionicons name="cloud-offline-outline" size={48} color="#2D6A4F" />
        <Text style={{ color: colors.textMuted }}>Esta ruta ya no está disponible.</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: colors.accent, fontWeight: '600' }}>Volver</Text>
        </TouchableOpacity>
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
      {/* Header (sin eliminar — ruta de otro usuario) */}
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="globe-outline" size={16} color={colors.accent} />
          <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '600' }}>Pública</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
        {/* Meta */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, marginTop: 8 }}>
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
        </View>

        {/* Descripción */}
        {route.description ? (
          <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 20 }}>
            {route.description}
          </Text>
        ) : null}

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

        {/* Mapa de la ruta (tap → mapa interactivo a pantalla completa) */}
        {gpsPoints.length > 1 && (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => router.push(`/routes/map/${route.id}?public=1`)}
            style={{
              height: 220, borderRadius: 12, overflow: 'hidden',
              marginBottom: 16, borderWidth: 1, borderColor: '#2D6A4F',
            }}
          >
            <RouteMap gpsPoints={gpsPoints} waypoints={waypoints} />
            <View
              pointerEvents="none"
              style={{
                position: 'absolute', top: 10, right: 10,
                flexDirection: 'row', alignItems: 'center', gap: 6,
                backgroundColor: '#0D1B12CC', borderRadius: 8,
                paddingHorizontal: 10, paddingVertical: 6,
                borderWidth: 1, borderColor: '#2D6A4F80',
              }}
            >
              <Ionicons name="expand-outline" size={14} color={colors.accent} />
              <Text style={{ color: colors.textPrimary, fontSize: 11, fontWeight: '600' }}>Ver mapa</Text>
            </View>
          </TouchableOpacity>
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
              onPress={() => router.push(`/routes/replay/${route.id}?public=1`)}
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
              <WaypointDetailCard key={wp.id} wp={wp} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
