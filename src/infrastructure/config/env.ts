import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? {};

export const ENV = {
  SUPABASE_URL: (process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra.supabaseUrl ?? '') as string,
  SUPABASE_ANON_KEY: (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? extra.supabaseAnonKey ?? '') as string,
  THUNDERFOREST_API_KEY: (process.env.EXPO_PUBLIC_THUNDERFOREST_API_KEY ?? extra.thunderforestApiKey ?? '') as string,
  /** Dominio (con https) que sirve los App Links / Universal Links de "seguir en vivo". */
  LIVE_SHARE_BASE_URL: (process.env.EXPO_PUBLIC_LIVE_SHARE_BASE_URL ?? extra.liveShareBaseUrl ?? 'https://nankamay.trek-peru.com') as string,
} as const;

/** URLs de tiles de Thunderforest para cualquier estilo (múltiples subdominios para balanceo de carga) */
export function thunderforestTileUrls(style: string = 'outdoors'): string[] {
  const key = ENV.THUNDERFOREST_API_KEY;
  return [
    `https://a.tile.thunderforest.com/${style}/{z}/{x}/{y}.png?apikey=${key}`,
    `https://b.tile.thunderforest.com/${style}/{z}/{x}/{y}.png?apikey=${key}`,
    `https://c.tile.thunderforest.com/${style}/{z}/{x}/{y}.png?apikey=${key}`,
  ];
}

/** @deprecated Usar thunderforestTileUrls() */
export function thunderforestTileUrl(): string {
  return thunderforestTileUrls()[0];
}

/**
 * Enlace https para "seguir en vivo" (Android App Link / iOS Universal Link). Al
 * tocarlo abre la app en `/seguir/<token>` si está instalada y verificada; si no,
 * abre la web de ayuda. El `<token>` lo resuelve `extractFollowToken`.
 */
export function liveFollowUrl(token: string): string {
  return `${ENV.LIVE_SHARE_BASE_URL.replace(/\/+$/, '')}/seguir/${token}`;
}
