import { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { routeRepository } from '@infrastructure/repositories/RouteRepositoryImpl';
import { useAuthStore } from '@presentation/stores/authStore';
import { usePersonalMetrics } from '@presentation/hooks/usePersonalMetrics';
import {
  computeZones, computeTopPlaces,
  type RouteAnchor, type WaypointLite,
} from '@application/metrics/computeZones';
import { reverseGeocode } from '@infrastructure/services/ReverseGeocodeService';
import ClusterMap from '@presentation/components/routes/ClusterMap';
import WaypointIcon from '@presentation/components/ui/WaypointIcon';
import { getWaypointTypeInfo } from '@shared/constants/waypointTypes';
import { formatDistance, formatElevation } from '@shared/utils/formatters';
import { colors } from '@presentation/theme/colors';

export default function PlacesScreen() {
  const { user } = useAuthStore();
  const { summary } = usePersonalMetrics('month');
  const [anchors, setAnchors] = useState<RouteAnchor[]>([]);
  const [waypoints, setWaypoints] = useState<WaypointLite[]>([]);
  // Nombres de lugar reales por zona (id → nombre), resueltos online y cacheados.
  const [zoneNames, setZoneNames] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!user?.id) return;
    routeRepository.getRouteAnchors(user.id).then(setAnchors).catch(() => {});
    routeRepository.getAllWaypointsLite(user.id).then(setWaypoints).catch(() => {});
  }, [user?.id]);

  const zones = useMemo(() => computeZones(anchors), [anchors]);
  const places = useMemo(() => computeTopPlaces(waypoints), [waypoints]);

  // Enriquecer las etiquetas de zona con nombres de lugar reales (Nominatim).
  // En serie (respeta el límite de Nominatim); offline conserva el nombre base.
  useEffect(() => {
    if (zones.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const z of zones) {
        const name = await reverseGeocode(z.lat, z.lon);
        if (cancelled) return;
        if (name) setZoneNames((prev) => (prev[z.id] === name ? prev : { ...prev, [z.id]: name }));
      }
    })();
    return () => { cancelled = true; };
  }, [zones]);

  const stats = [
    { value: String(zones.length), label: 'Zonas' },
    { value: String(places.length), label: 'Lugares' },
    { value: String(summary.routeCount), label: 'Este mes' },
  ];

  const sectionLabel = (txt: string) => (
    <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', letterSpacing: 1, marginBottom: 10 }}>{txt}</Text>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={{ color: colors.textPrimary, fontSize: 22, fontWeight: '700', fontFamily: 'Sora' }}>Lugares</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 16 }}>
        {/* Resumen */}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
          {stats.map((s) => (
            <View key={s.label} style={{ flex: 1, backgroundColor: colors.bgCard, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, gap: 2 }}>
              <Text style={{ color: colors.accent, fontSize: 20, fontWeight: '800' }}>{s.value}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Mapa de concentración */}
        <View style={{
          height: 200, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.border,
          backgroundColor: colors.bgCard, justifyContent: 'center', alignItems: 'center',
        }}>
          {zones.length > 0 ? (
            <ClusterMap zones={zones} />
          ) : (
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>Aún no hay zonas registradas.</Text>
          )}
        </View>

        {/* Zonas más frecuentes */}
        {zones.length > 0 && (
          <View>
            {sectionLabel('ZONAS MÁS FRECUENTES')}
            <View style={{ gap: 10 }}>
              {zones.slice(0, 6).map((z, i) => (
                <View key={z.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.bgCard, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border }}>
                  <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: i === 0 ? colors.accent : colors.bgElevated, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: i === 0 ? '#0D1B12' : colors.textSecondary, fontSize: 14, fontWeight: '800' }}>{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>{zoneNames[z.id] ?? z.label}</Text>
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.bgInput, overflow: 'hidden' }}>
                      <View style={{ width: `${Math.max(6, z.fraction * 100)}%`, height: 6, borderRadius: 3, backgroundColor: colors.accent }} />
                    </View>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                      {z.count} ruta{z.count > 1 ? 's' : ''} · {formatDistance(z.distanceMeters)}
                      {z.elevationGainMeters > 0 ? ` · ↑ ${formatElevation(z.elevationGainMeters)}` : ''}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Lugares más visitados */}
        {places.length > 0 && (
          <View>
            {sectionLabel('LUGARES MÁS VISITADOS')}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {places.slice(0, 12).map((p) => {
                const info = p.type ? getWaypointTypeInfo(p.type) : undefined;
                return (
                  <View key={p.title} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.bgCard, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.border }}>
                    <WaypointIcon name={info?.icon ?? 'MapPin'} size={14} color={colors.accent} />
                    <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{p.title}</Text>
                    {p.count > 1 && <Text style={{ color: colors.textMuted, fontSize: 12 }}>×{p.count}</Text>}
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
