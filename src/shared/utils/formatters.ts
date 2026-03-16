/** Formatea metros a texto legible: "1.2 km" o "450 m" */
export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${Math.round(meters)} m`;
}

/** Formatea segundos a "1h 23m 45s" o "23m 45s" */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Formatea km/h a "4.5 km/h" */
export function formatSpeed(kmh: number): string {
  return `${kmh.toFixed(1)} km/h`;
}

/** Formatea metros de elevación con signo: "+340 m" o "-120 m" */
export function formatElevation(meters: number, showSign = true): string {
  const sign = showSign && meters > 0 ? '+' : '';
  return `${sign}${Math.round(meters)} m`;
}

/** Formatea una fecha a string legible: "15 mar 2026" */
export function formatDate(date: Date): string {
  return date.toLocaleDateString('es-PE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
