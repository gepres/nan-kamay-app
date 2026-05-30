import { useId } from 'react';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import { colors } from '@presentation/theme/colors';

interface Props {
  /** Muestras normalizadas [0..1] (de `downsampleElevation`). */
  data: number[];
  height?: number;
  color?: string;
}

/**
 * Mini-perfil de elevación (sparkline) como "firma" visual de una card de ruta.
 * Usa un viewBox 0..100 en X con `preserveAspectRatio="none"` para estirarse al
 * ancho del contenedor sin necesidad de medirlo; el trazo se mantiene uniforme
 * con `vectorEffect="non-scaling-stroke"`.
 */
export default function ElevationSparkline({ data, height = 44, color = colors.accent }: Props) {
  // id único por instancia: evita colisiones de gradiente entre varias cards.
  const gid = `elev${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  if (!data || data.length < 2) return null;

  const n = data.length;
  const top = 6;
  const bottom = 4;
  const usable = height - top - bottom;

  const pts = data.map((v, i) => {
    const x = (i / (n - 1)) * 100;
    const y = top + (1 - v) * usable;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const line = `M${pts.join(' L')}`;
  const area = `${line} L100,${height} L0,${height} Z`;

  return (
    <Svg width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.32} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path d={area} fill={`url(#${gid})`} />
      <Path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </Svg>
  );
}
