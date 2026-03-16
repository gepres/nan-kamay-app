import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? {};

export const ENV = {
  SUPABASE_URL: (process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra.supabaseUrl ?? '') as string,
  SUPABASE_ANON_KEY: (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? extra.supabaseAnonKey ?? '') as string,
  THUNDERFOREST_API_KEY: (process.env.EXPO_PUBLIC_THUNDERFOREST_API_KEY ?? extra.thunderforestApiKey ?? '') as string,
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
