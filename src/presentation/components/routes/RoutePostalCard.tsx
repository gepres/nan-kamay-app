import { useMemo } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Route } from '@core/entities/Route';
import { GpsPoint } from '@core/entities/GpsPoint';
import { formatDistance, formatDuration, formatElevation } from '@shared/utils/formatters';
import { simplifyLngLat } from '@shared/utils/geometry';
import { colors } from '@presentation/theme/colors';

export interface PostalOptions {
  /** Fondo transparente (estilo Strava) vs tarjeta sólida. Ignorado si hay foto. */
  transparent: boolean;
  showName: boolean;
  showStats: boolean;
  showElevation: boolean;
}

/** Reposicionamiento/escala del trazo dentro del lienzo (lo controla el usuario). */
export interface TraceTransform {
  tx: number;
  ty: number;
  scale: number;
}

interface Props {
  route: Route;
  gpsPoints: GpsPoint[];
  options: PostalOptions;
  /** Ancho del lienzo en px (la altura se deriva). */
  width: number;
  /** Foto de fondo opcional (galería o de un waypoint). Activa el modo "foto". */
  backgroundUri?: string | null;
  /** Desplazamiento/escala del trazo aplicado por el usuario. */
  traceTransform?: TraceTransform;
}

/** Proyecta lon/lat a coordenadas de lienzo preservando el aspecto (corrección
 *  por latitud) y dejando un margen interior. Devuelve el path SVG. */
function buildTracePath(gpsPoints: GpsPoint[], w: number, h: number, pad: number) {
  if (gpsPoints.length < 2) return null;
  // Simplificar (RDP) antes de proyectar: traza limpia sin serpenteo.
  const ll = simplifyLngLat(gpsPoints.map((p) => [p.longitude, p.latitude] as [number, number]));
  const lons = ll.map((c) => c[0]);
  const lats = ll.map((c) => c[1]);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const midLat = (minLat + maxLat) / 2;
  const cosLat = Math.cos((midLat * Math.PI) / 180) || 1;

  const spanX = (maxLon - minLon) * cosLat || 1e-6;
  const spanY = (maxLat - minLat) || 1e-6;

  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  const scale = Math.min(innerW / spanX, innerH / spanY);

  const drawW = spanX * scale;
  const drawH = spanY * scale;
  const offX = pad + (innerW - drawW) / 2;
  const offY = pad + (innerH - drawH) / 2;

  const project = (lon: number, lat: number): [number, number] => {
    const x = offX + (lon - minLon) * cosLat * scale;
    const y = offY + (maxLat - lat) * scale; // y invertida (pantalla)
    return [x, y];
  };

  const pts = ll.map((c) => project(c[0], c[1]));
  const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  return { d, start: pts[0], end: pts[pts.length - 1] };
}

/** Barras de elevación normalizadas (carry-forward para huecos nulos). */
function buildElevationBars(gpsPoints: GpsPoint[], n = 40): number[] {
  const raw = gpsPoints.map((p) => p.altitude);
  if (!raw.some((a) => a != null)) return [];
  let last = raw.find((a) => a != null) as number;
  const filled = raw.map((a) => { if (a != null) last = a; return last; });
  const min = Math.min(...filled), max = Math.max(...filled);
  const span = max - min;
  const bars: number[] = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.round((i / (n - 1)) * (filled.length - 1));
    bars.push(span > 0 ? (filled[idx] - min) / span : 0);
  }
  return bars;
}

const TRACE_STROKE = colors.accent;
const TEXT_SHADOW = {
  textShadowColor: '#000000CC',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 6,
} as const;

function TraceSvg({ gpsPoints, w, h, pad, halo }: { gpsPoints: GpsPoint[]; w: number; h: number; pad: number; halo: boolean }) {
  const trace = useMemo(() => buildTracePath(gpsPoints, w, h, pad), [gpsPoints, w, h, pad]);
  if (!trace) return null;
  return (
    <Svg width={w} height={h}>
      {halo && (
        <Path d={trace.d} stroke="#00000055" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      )}
      <Path d={trace.d} stroke={TRACE_STROKE} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Circle cx={trace.start[0]} cy={trace.start[1]} r={7} fill={colors.success} stroke="#fff" strokeWidth={2.5} />
      <Circle cx={trace.end[0]} cy={trace.end[1]} r={7} fill="#EF4444" stroke="#fff" strokeWidth={2.5} />
    </Svg>
  );
}

/**
 * Tarjeta "postal" de una ruta. Dibuja la traza con SVG (sin tiles), por lo que
 * funciona sobre fondo transparente (estilo Strava), tarjeta sólida o sobre una
 * FOTO de fondo (galería o de un waypoint). Pensada para capturarse con view-shot.
 */
export default function RoutePostalCard({ route, gpsPoints, options, width, backgroundUri, traceTransform }: Props) {
  const { transparent, showName, showStats, showElevation } = options;
  const W = width;
  const photoMode = !!backgroundUri;
  const tt = traceTransform ?? { tx: 0, ty: 0, scale: 1 };
  const traceStyle = { transform: [{ translateX: tt.tx }, { translateY: tt.ty }, { scale: tt.scale }] };
  const bars = useMemo(() => (showElevation ? buildElevationBars(gpsPoints) : []), [gpsPoints, showElevation]);

  const stats = [
    { label: 'Distancia', value: formatDistance(route.distanceMeters) },
    { label: 'Duración', value: formatDuration(route.durationSeconds) },
    { label: 'Subida', value: formatElevation(route.elevationGainMeters) },
    { label: 'Elev. máx.', value: formatElevation(route.maxElevationMeters, false) },
  ];

  // Texto sobre overlay (foto o transparente) → blanco con sombra.
  const overlayText = photoMode || transparent;
  const statLabelColor = overlayText ? '#FFFFFFB0' : colors.textMuted;
  const textShadow = overlayText ? TEXT_SHADOW : {};

  const Footer = (
    <>
      {showName && (
        <View style={{ paddingHorizontal: 20, marginTop: photoMode ? 0 : (transparent ? 4 : -4) }}>
          <Text style={[{ color: colors.accent, fontSize: 11, fontWeight: '700', letterSpacing: 2 }, textShadow]}>
            ÑAN KAMAY
          </Text>
          <Text style={[{ color: '#FFFFFF', fontSize: 24, fontWeight: '800' }, textShadow]} numberOfLines={2}>
            {route.name}
          </Text>
        </View>
      )}

      {showStats && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20, marginTop: 14, gap: overlayText ? 0 : 12 }}>
          {stats.map((s) => (
            <View
              key={s.label}
              style={
                overlayText
                  ? { width: '50%', paddingVertical: 6 }
                  : {
                      width: (W - 40 - 12) / 2,
                      backgroundColor: colors.bgCard,
                      borderRadius: 12, padding: 14,
                      borderWidth: 1, borderColor: colors.border,
                    }
              }
            >
              <Text style={[{ color: '#FFFFFF', fontSize: 20, fontWeight: '800' }, textShadow]}>{s.value}</Text>
              <Text style={[{ color: statLabelColor, fontSize: 12, marginTop: 2 }, textShadow]}>{s.label}</Text>
            </View>
          ))}
        </View>
      )}

      {showElevation && bars.length > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 48, gap: 2, paddingHorizontal: 20, marginTop: 16 }}>
          {bars.map((v, i) => (
            <View key={i} style={{ flex: 1, height: 8 + v * 36, borderRadius: 1, backgroundColor: colors.accent, opacity: overlayText ? 0.95 : 1 }} />
          ))}
        </View>
      )}
    </>
  );

  // ── Modo FOTO: imagen de fondo + traza encima + degradado + datos abajo ──
  if (photoMode) {
    const PHOTO_H = Math.round(W * 1.2);
    return (
      <View style={{ width: W, height: PHOTO_H, borderRadius: 20, overflow: 'hidden', backgroundColor: '#000' }}>
        <Image source={{ uri: backgroundUri! }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <View style={[StyleSheet.absoluteFill, traceStyle]}>
          <TraceSvg gpsPoints={gpsPoints} w={W} h={PHOTO_H} pad={40} halo />
        </View>
        <LinearGradient
          colors={['#0D1B1200', '#0D1B1266', '#0D1B12F2']}
          locations={[0, 0.5, 1]}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: PHOTO_H * 0.62 }}
        />
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: 20 }}>
          {Footer}
        </View>
      </View>
    );
  }

  // ── Modo transparente / sólido ──
  const TRACE_H = Math.round(W * 0.62);
  return (
    <View
      style={{
        width: W,
        backgroundColor: transparent ? 'transparent' : colors.bgPrimary,
        borderRadius: transparent ? 0 : 20,
        overflow: 'hidden',
        paddingBottom: transparent ? 8 : 0,
      }}
    >
      <View style={[{ width: W, height: TRACE_H }, traceStyle]}>
        <TraceSvg gpsPoints={gpsPoints} w={W} h={TRACE_H} pad={28} halo={transparent} />
      </View>
      {Footer}
      {!transparent && <View style={{ height: 20 }} />}
    </View>
  );
}
