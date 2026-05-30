/**
 * Convierte una serie de altitudes (con posibles nulos) en N muestras
 * normalizadas [0..1], pensadas para dibujar una mini-gráfica de elevación
 * (sparkline) en las cards de ruta.
 *
 * - Rellena huecos (altitud nula) con "carry-forward".
 * - Si no hay ningún dato de altitud → devuelve null (la card no dibuja sparkline).
 * - Si la ruta es plana (sin variación) → muestras a 0.5 (línea media), para
 *   mantener una firma visual consistente.
 */
export function downsampleElevation(
  altitudes: (number | null | undefined)[],
  samples = 28,
): number[] | null {
  if (!altitudes.some((a) => a != null)) return null;

  let last = altitudes.find((a) => a != null) as number;
  const filled = altitudes.map((a) => {
    if (a != null) last = a as number;
    return last;
  });
  if (filled.length < 2) return null;

  const min = Math.min(...filled);
  const max = Math.max(...filled);
  const span = max - min;

  const out: number[] = [];
  for (let i = 0; i < samples; i++) {
    const idx = Math.round((i / (samples - 1)) * (filled.length - 1));
    out.push(span > 0 ? (filled[idx] - min) / span : 0.5);
  }
  return out;
}
