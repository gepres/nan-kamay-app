import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { useRoutesStore } from '@presentation/stores/routesStore';
import { usePersonalMetrics } from '@presentation/hooks/usePersonalMetrics';
import { computeRecentDays, type Period } from '@application/metrics/computeMetrics';
import { formatDistance, formatDuration, formatElevation } from '@shared/utils/formatters';
import { colors } from '@presentation/theme/colors';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mes' },
  { key: 'year', label: 'Año' },
];
const ACTIVITY_COLORS = ['#F59E0B', '#22C55E', '#60A5FA', '#A78BFA', '#F472B6', '#FB923C'];

/** Donut con react-native-svg (un Circle por porción, stroke-dash). */
function Donut({ slices, centerTop, centerSub }: {
  slices: { fraction: number; color: string }[]; centerTop: string; centerSub: string;
}) {
  const size = 116, sw = 16, r = (size - sw) / 2, c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.bgInput} strokeWidth={sw} fill="none" />
        {slices.map((s, i) => {
          const len = s.fraction * c;
          const el = (
            <Circle
              key={i}
              cx={size / 2} cy={size / 2} r={r}
              stroke={s.color} strokeWidth={sw} fill="none"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-acc}
              strokeLinecap="butt"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
          acc += len;
          return el;
        })}
      </Svg>
      <Text style={{ color: colors.textPrimary, fontSize: 22, fontWeight: '800' }}>{centerTop}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 11 }}>{centerSub}</Text>
    </View>
  );
}

export default function ProgressScreen() {
  const [period, setPeriod] = useState<Period>('month');
  const { routes } = useRoutesStore();
  const { summary, series, activity, records } = usePersonalMetrics(period);
  const recentDays = computeRecentDays(routes, 7);

  const totals = [
    { icon: 'map-outline', value: formatDistance(summary.distanceMeters), label: 'Distancia' },
    { icon: 'trending-up-outline', value: formatElevation(summary.elevationGainMeters, false), label: 'Desnivel' },
    { icon: 'time-outline', value: formatDuration(summary.movingSeconds), label: 'En movimiento' },
    { icon: 'flag-outline', value: String(summary.routeCount), label: 'Rutas' },
  ];

  const maxBar = Math.max(1, ...series.map((b) => b.distanceMeters));
  const slices = activity.map((a, i) => ({ fraction: a.fraction, color: ACTIVITY_COLORS[i % ACTIVITY_COLORS.length] }));
  const trend = summary.distanceTrendPct;

  const sectionLabel = (txt: string) => (
    <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', letterSpacing: 1, marginBottom: 10 }}>{txt}</Text>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={{ color: colors.textPrimary, fontSize: 22, fontWeight: '700', fontFamily: 'Sora' }}>Progreso</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 18 }}>
        {/* Selector de periodo */}
        <View style={{ flexDirection: 'row', gap: 4, backgroundColor: colors.bgCard, borderRadius: 12, padding: 4, borderWidth: 1, borderColor: colors.border, marginTop: 8 }}>
          {PERIODS.map((p) => {
            const on = period === p.key;
            return (
              <TouchableOpacity key={p.key} onPress={() => setPeriod(p.key)}
                style={{ flex: 1, height: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.accent : 'transparent' }}>
                <Text style={{ color: on ? '#0D1B12' : colors.textSecondary, fontSize: 14, fontWeight: on ? '700' : '500' }}>{p.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Totales 2x2 */}
        <View style={{ gap: 10 }}>
          {[totals.slice(0, 2), totals.slice(2, 4)].map((row, ri) => (
            <View key={ri} style={{ flexDirection: 'row', gap: 10 }}>
              {row.map((t) => (
                <View key={t.label} style={{ flex: 1, backgroundColor: colors.bgCard, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, gap: 6 }}>
                  <Ionicons name={t.icon as any} size={18} color={colors.accent} />
                  <Text style={{ color: colors.textPrimary, fontSize: 22, fontWeight: '800' }}>{t.value}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11 }}>{t.label}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>

        {/* Distancia por periodo (barras) */}
        <View style={{ backgroundColor: colors.bgCard, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border, gap: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '700' }}>Distancia</Text>
            {trend != null && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: (trend >= 0 ? colors.success : colors.danger) + '20', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                <Ionicons name={trend >= 0 ? 'trending-up' : 'trending-down'} size={13} color={trend >= 0 ? colors.success : colors.danger} />
                <Text style={{ color: trend >= 0 ? colors.success : colors.danger, fontSize: 12, fontWeight: '700' }}>
                  {trend >= 0 ? '+' : ''}{trend.toFixed(0)}%
                </Text>
              </View>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, height: 110 }}>
            {series.map((b, i) => (
              <View key={i} style={{ flex: 1, height: Math.max(6, (b.distanceMeters / maxBar) * 104), borderRadius: 6, backgroundColor: b.current ? colors.accent : colors.bgElevated }} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {series.map((b, i) => (
              <Text key={i} style={{ flex: 1, color: colors.textMuted, fontSize: 11, textAlign: 'center' }}>{b.label}</Text>
            ))}
          </View>
        </View>

        {/* Por actividad (donut) */}
        {slices.length > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: colors.bgCard, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border }}>
            <Donut slices={slices} centerTop={String(records.totalRoutes)} centerSub="rutas" />
            <View style={{ flex: 1, gap: 10 }}>
              {activity.slice(0, 5).map((a, i) => (
                <View key={a.type} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: ACTIVITY_COLORS[i % ACTIVITY_COLORS.length] }} />
                  <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }} numberOfLines={1}>{a.type}</Text>
                  <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '700' }}>{Math.round(a.fraction * 100)}%</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Constancia */}
        <View style={{ backgroundColor: colors.bgCard, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border, gap: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '700' }}>Constancia</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="flame" size={15} color={colors.accent} />
              <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '700' }}>
                {records.streakDays > 0 ? `Racha ${records.streakDays} día${records.streakDays > 1 ? 's' : ''}` : 'Sin racha'}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {recentDays.map((d, i) => (
              <View key={i} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                <View style={{
                  width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: d.active ? colors.accent : colors.bgInput,
                  borderWidth: 1, borderColor: d.today ? colors.accent : colors.border,
                }}>
                  {d.active && <Ionicons name="checkmark" size={16} color="#0D1B12" />}
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>{d.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {records.totalRoutes === 0 && (
          <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 8 }}>
            Aún no tienes rutas. Graba una para ver tu progreso.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
