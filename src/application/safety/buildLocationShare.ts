import * as Location from 'expo-location';

/**
 * Seguridad — obtener la mejor posición disponible para un check-in / S.O.S. y
 * armar el mensaje. Funciona OFFLINE: el GPS no necesita datos; el SMS sale por
 * la red celular de voz/texto (suele haber donde no hay datos).
 */

export interface LocationShare {
  lat: number;
  lon: number;
  accuracy: number | null;
  mapsUrl: string;
  /** HH:MM local del fix. */
  whenLabel: string;
}

/**
 * Intenta un fix actual con timeout corto y cae a la última posición conocida.
 * Lanza si no hay permiso ni posición previa.
 */
export async function buildLocationShare(timeoutMs = 8000): Promise<LocationShare> {
  let granted = (await Location.getForegroundPermissionsAsync()).status === 'granted';
  if (!granted) {
    granted = (await Location.requestForegroundPermissionsAsync()).status === 'granted';
  }
  if (!granted) throw new Error('Sin permiso de ubicación.');

  // getCurrentPositionAsync no tiene timeout propio → carrera con un fallback.
  const fix = await Promise.race<Location.LocationObject | null>([
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
  const loc = fix ?? (await Location.getLastKnownPositionAsync());
  if (!loc) throw new Error('No se pudo obtener tu ubicación. Sal a cielo abierto e intenta de nuevo.');

  const lat = loc.coords.latitude;
  const lon = loc.coords.longitude;
  const accuracy = loc.coords.accuracy ?? null;
  const mapsUrl = `https://maps.google.com/?q=${lat.toFixed(6)},${lon.toFixed(6)}`;
  const d = new Date();
  const whenLabel = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return { lat, lon, accuracy, mapsUrl, whenLabel };
}

/** Mensaje de texto para el SMS, según el tipo. */
export function composeSafetyMessage(share: LocationShare, kind: 'checkin' | 'sos'): string {
  const head = kind === 'sos'
    ? '🆘 NECESITO AYUDA (Ñan Kamay)'
    : '✅ Estoy bien — check-in (Ñan Kamay)';
  const acc = share.accuracy != null ? ` (precisión ±${Math.round(share.accuracy)} m)` : '';
  return `${head}\nMi ubicación a las ${share.whenLabel}:\n${share.mapsUrl}${acc}`;
}

/**
 * Mensaje para invitar a seguir en vivo (PR2). El `link` es un App Link/Universal
 * Link https (`liveFollowUrl(token)`): al tocarlo abre Ñan Kamay directo en el
 * seguimiento si está instalada y verificada; si no, abre la web para instalarla.
 * (Ya no usa el esquema custom, que los SMS/WhatsApp no convertían en enlace.)
 */
export function composeFollowMessage(link: string, ownerName: string): string {
  const who = ownerName?.trim() || 'Tu contacto';
  return `🔭 Sígueme en vivo (Ñan Kamay)\n${who} comparte su ubicación en tiempo real. Toca para seguirlo en el mapa:\n${link}`;
}
