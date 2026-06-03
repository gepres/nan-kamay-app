import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Split } from '@application/metrics/computeSplits';
import { colors } from '@presentation/theme/colors';

const COLLAPSED_ROWS = 5;

function fmtPace(secPerKm: number | null): string {
  if (secPerKm == null || !isFinite(secPerKm)) return '—';
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function SplitsTable({ splits }: { splits: Split[] }) {
  const [expanded, setExpanded] = useState(false);

  const minPace = useMemo(() => {
    const ps = splits.map((s) => s.paceSecPerKm).filter((p): p is number => p != null && isFinite(p));
    return ps.length ? Math.min(...ps) : null;
  }, [splits]);

  if (splits.length === 0) return null;
  const rows = expanded ? splits : splits.slice(0, COLLAPSED_ROWS);
  const hasMore = splits.length > COLLAPSED_ROWS;

  return (
    <View style={{
      backgroundColor: colors.bgCard, borderRadius: 12, padding: 14,
      borderWidth: 1, borderColor: '#2D6A4F', marginBottom: 16,
    }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '700' }}>Parciales por km</Text>
        <Text style={{ color: colors.textMuted, fontSize: 11 }}>ritmo /km</Text>
      </View>

      <View style={{ gap: 8 }}>
        {rows.map((s) => {
          const ratio = minPace != null && s.paceSecPerKm != null && isFinite(s.paceSecPerKm)
            ? Math.max(0.12, minPace / s.paceSecPerKm)
            : 0.12;
          return (
            <View key={s.index} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 12, width: 52 }}>
                {s.partial ? `${(s.distanceMeters / 1000).toFixed(1)} km` : `km ${s.index}`}
              </Text>
              <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.bgInput, overflow: 'hidden' }}>
                <View style={{ width: `${ratio * 100}%`, height: 8, borderRadius: 4, backgroundColor: s.partial ? colors.bgElevated : colors.accent }} />
              </View>
              {s.elevGainMeters > 0 && (
                <Text style={{ color: colors.textMuted, fontSize: 11, width: 46, textAlign: 'right' }}>+{s.elevGainMeters} m</Text>
              )}
              <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '700', width: 48, textAlign: 'right' }}>
                {fmtPace(s.paceSecPerKm)}
              </Text>
            </View>
          );
        })}
      </View>

      {hasMore && (
        <TouchableOpacity
          onPress={() => setExpanded((v) => !v)}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 12 }}
        >
          <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '600' }}>
            {expanded ? 'Ver menos' : `Ver los ${splits.length} parciales`}
          </Text>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.accent} />
        </TouchableOpacity>
      )}
    </View>
  );
}
