import { View, Text } from 'react-native';
import { GpsPoint } from '@core/entities/GpsPoint';
import { colors } from '@presentation/theme/colors';

interface Props {
  gpsPoints: GpsPoint[];
  height?: number;
}

/**
 * Gráfica de perfil de elevación usando barras puras de React Native.
 * Samplea hasta MAX_BARS puntos para no saturar el render.
 */
const MAX_BARS = 80;

export default function ElevationChart({ gpsPoints, height = 80 }: Props) {
  const pointsWithAlt = gpsPoints.filter((p) => p.altitude != null);
  if (pointsWithAlt.length < 2) return null;

  // Samplear
  const step = Math.max(1, Math.floor(pointsWithAlt.length / MAX_BARS));
  const sampled = pointsWithAlt.filter((_, i) => i % step === 0);

  const altitudes = sampled.map((p) => p.altitude as number);
  const minAlt = Math.min(...altitudes);
  const maxAlt = Math.max(...altitudes);
  const range = maxAlt - minAlt || 1;

  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={{ color: colors.textMuted, fontSize: 11 }}>Perfil de elevación</Text>
        <Text style={{ color: colors.textMuted, fontSize: 11 }}>
          {minAlt.toFixed(0)} – {maxAlt.toFixed(0)} m
        </Text>
      </View>

      <View
        style={{
          height,
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: 1,
          backgroundColor: '#0D1B12',
          borderRadius: 8,
          paddingHorizontal: 4,
          paddingBottom: 4,
          paddingTop: 4,
          overflow: 'hidden',
        }}
      >
        {sampled.map((p, i) => {
          const alt = p.altitude as number;
          const ratio = (alt - minAlt) / range;
          const barHeight = Math.max(4, ratio * (height - 12));
          // Color degradé: verde bajo → amarillo → naranja alto
          const hue = Math.round(120 - ratio * 80); // 120 (verde) → 40 (amarillo-naranja)
          const color = `hsl(${hue}, 70%, 50%)`;
          return (
            <View
              key={i}
              style={{
                flex: 1,
                height: barHeight,
                backgroundColor: color,
                borderRadius: 2,
                opacity: 0.85,
              }}
            />
          );
        })}
      </View>
    </View>
  );
}
