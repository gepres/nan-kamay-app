import { useMemo, useRef, useState } from 'react';
import { View, Text, PanResponder, type LayoutChangeEvent } from 'react-native';
import { GpsPoint } from '@core/entities/GpsPoint';
import { fastDistanceMeters } from '@shared/utils/geometry';
import { formatDistance, formatDuration } from '@shared/utils/formatters';
import { colors } from '@presentation/theme/colors';

interface Props {
  gpsPoints: GpsPoint[];
  height?: number;
  /** Índice (en gpsPoints) del punto bajo el dedo, o null al soltar. */
  onScrub?: (index: number | null) => void;
}

const MAX_BARS = 80;
const TOOLTIP_W = 150;

/**
 * Perfil de elevación INTERACTIVO: arrastra para mover un cursor; emite el
 * índice del punto (`onScrub`) para resaltarlo en el mapa, y muestra un tooltip
 * con distancia / altitud / tiempo. Mismo motor de scrubbing que el replay.
 */
export default function InteractiveElevationChart({ gpsPoints, height = 110, onScrub }: Props) {
  const samples = useMemo(() => {
    const withAlt = gpsPoints.filter((p) => p.altitude != null);
    if (withAlt.length < 2) return null;

    // Distancia acumulada + tiempo + altitud (carry-forward) sobre todos los puntos.
    const t0 = gpsPoints[0].recordedAt.getTime();
    let lastAlt = withAlt[0].altitude as number;
    let cum = 0;
    const all = gpsPoints.map((p, i) => {
      if (i > 0) {
        cum += fastDistanceMeters(
          gpsPoints[i - 1].latitude, gpsPoints[i - 1].longitude,
          p.latitude, p.longitude,
        );
      }
      if (p.altitude != null) lastAlt = p.altitude;
      return { origIndex: i, alt: lastAlt, dist: cum, t: (p.recordedAt.getTime() - t0) / 1000 };
    });

    const step = Math.max(1, Math.floor(all.length / MAX_BARS));
    const s = all.filter((_, i) => i % step === 0);
    if (s[s.length - 1] !== all[all.length - 1]) s.push(all[all.length - 1]);
    return s;
  }, [gpsPoints]);

  const [width, setWidth] = useState(0);
  const [frac, setFrac] = useState<number | null>(null);
  const widthRef = useRef(0);

  const pan = useMemo(() => {
    const handle = (x: number) => {
      const w = widthRef.current;
      if (w <= 0 || !samples) return;
      const f = Math.max(0, Math.min(1, x / w));
      setFrac(f);
      const idx = Math.round(f * (samples.length - 1));
      onScrub?.(samples[idx].origIndex);
    };
    const end = () => { setFrac(null); onScrub?.(null); };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => handle(e.nativeEvent.locationX),
      onPanResponderMove: (e) => handle(e.nativeEvent.locationX),
      onPanResponderRelease: end,
      onPanResponderTerminate: end,
    });
  }, [samples, onScrub]);

  if (!samples) return null;

  const alts = samples.map((s) => s.alt);
  const minAlt = Math.min(...alts);
  const maxAlt = Math.max(...alts);
  const range = maxAlt - minAlt || 1;

  const cur = frac != null ? samples[Math.round(frac * (samples.length - 1))] : null;
  const tipLeft = frac != null ? Math.max(0, Math.min(width - TOOLTIP_W, frac * width - TOOLTIP_W / 2)) : 0;

  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text style={{ color: colors.textMuted, fontSize: 11 }}>Perfil de elevación</Text>
        <Text style={{ color: colors.textMuted, fontSize: 11 }}>{minAlt.toFixed(0)} – {maxAlt.toFixed(0)} m</Text>
      </View>

      <View style={{ position: 'relative' }}>
        {/* Tooltip flotante */}
        {cur && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute', top: -2, left: tipLeft, width: TOOLTIP_W, zIndex: 10,
              backgroundColor: '#0D1B12F2', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
              borderWidth: 1, borderColor: colors.accent,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
              {formatDistance(cur.dist)} · {Math.round(cur.alt)} m
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 1 }}>
              {formatDuration(cur.t)}
            </Text>
          </View>
        )}

        <View
          {...pan.panHandlers}
          onLayout={(e: LayoutChangeEvent) => { const w = e.nativeEvent.layout.width; widthRef.current = w; setWidth(w); }}
          style={{
            height, flexDirection: 'row', alignItems: 'flex-end', gap: 1,
            backgroundColor: '#0D1B12', borderRadius: 8,
            paddingHorizontal: 4, paddingBottom: 4, paddingTop: 4, overflow: 'hidden',
          }}
        >
          {samples.map((s, i) => {
            const ratio = (s.alt - minAlt) / range;
            const barHeight = Math.max(4, ratio * (height - 12));
            const hue = Math.round(120 - ratio * 80);
            const active = frac != null && i <= Math.round(frac * (samples.length - 1));
            return (
              <View
                key={i}
                style={{
                  flex: 1, height: barHeight, borderRadius: 2,
                  backgroundColor: active ? colors.accent : `hsl(${hue}, 70%, 50%)`,
                  opacity: 0.9,
                }}
              />
            );
          })}
        </View>

        {/* Línea vertical del cursor */}
        {frac != null && width > 0 && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute', top: 0, bottom: 0,
              left: Math.max(0, Math.min(width - 2, frac * width)),
              width: 2, backgroundColor: '#fff',
            }}
          />
        )}
      </View>

      <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 6, textAlign: 'center' }}>
        Arrastra el gráfico para ver cada punto en el mapa
      </Text>
    </View>
  );
}
