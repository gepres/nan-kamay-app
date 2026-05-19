/** Devuelve el número si es finito; si no (NaN/Infinity), 0. */
function finite(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

/** Formatea metros a texto legible: "1.2 km" o "450 m" */
export function formatDistance(meters: number): string {
  const m = Math.max(0, finite(meters));
  if (m >= 1000) {
    return `${(m / 1000).toFixed(2)} km`;
  }
  return `${Math.round(m)} m`;
}

/** Formatea segundos a "1h 23m 45s" o "23m 45s" */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(finite(seconds)));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Formatea km/h a "4.5 km/h" */
export function formatSpeed(kmh: number): string {
  return `${Math.max(0, finite(kmh)).toFixed(1)} km/h`;
}

/** Formatea metros de elevación con signo: "+340 m" o "-120 m" */
export function formatElevation(meters: number, showSign = true): string {
  const m = finite(meters);
  const sign = showSign && m > 0 ? '+' : '';
  return `${sign}${Math.round(m)} m`;
}

/** Formatea una fecha a string legible: "15 mar 2026" */
export function formatDate(date: Date): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('es-PE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
