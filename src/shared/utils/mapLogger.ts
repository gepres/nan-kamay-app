import { Logger } from '@maplibre/maplibre-react-native';

/**
 * Logger ÚNICO de MapLibre con buffer en memoria.
 *
 * Por qué: en una APK *release* los `console.*` de JS no llegan a logcat, y la
 * app silencia los "Failed to load tile" — así que cuando un mapa no pinta no
 * hay forma de ver el motivo sin cable/adb. Este buffer captura TODOS los
 * mensajes nativos de MapLibre (incluidos los fallos de tile, con su detalle) y
 * el diagnóstico de la app (`getOfflineDiagnostics`) los muestra en un Alert.
 *
 * Sigue silenciando el ruido conocido (devuelve `true`) para no llenar la
 * consola en debug, pero SIEMPRE lo registra antes.
 */
const MAX = 120;
const buffer: string[] = [];
// Buffer "pegajoso": líneas relevantes a PMTiles/estilo que NO se desalojan,
// para que no las borre el spam de "Failed to load tile" del raster (que falla
// en bucle cuando estás offline en la pantalla de descargas).
const STICKY_MAX = 30;
const sticky: string[] = [];

export function recordMapLog(line: string): void {
  buffer.push(line);
  if (buffer.length > MAX) buffer.shift();
  const l = line.toLowerCase();
  if (l.includes('pmtiles') || l.includes('[style]')) {
    if (sticky[sticky.length - 1] !== line) {
      sticky.push(line);
      if (sticky.length > STICKY_MAX) sticky.shift();
    }
  }
}

/** Líneas relevantes (PMTiles/estilo) + las más recientes en general. */
export function getRecentMapLog(): string[] {
  const tail = buffer.slice(-10);
  return [...sticky, ...tail.filter((t) => !sticky.includes(t))];
}

export function clearMapLog(): void {
  buffer.length = 0;
  sticky.length = 0;
}

/**
 * Instala el callback global de MapLibre que registra y filtra. Idempotente en
 * efecto (solo deja UN callback activo); puede llamarse en cada montaje de mapa
 * para reafirmarse sobre cualquier callback antiguo.
 */
export function installMapLogger(): void {
  Logger.setLogCallback((log: { message?: string; level?: string; tag?: string }) => {
    const level = String(log?.level ?? '');
    const tag = String(log?.tag ?? '');
    const msg = String(log?.message ?? '');
    recordMapLog(`${level}${tag ? '/' + tag : ''}: ${msg}`);
    if (msg.includes('Failed to load tile')) return true;
    if (msg.includes('permanent error: Canceled')) return true;
    return false;
  });
}
