import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? {};

export const ENV = {
  SUPABASE_URL: (process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra.supabaseUrl ?? '') as string,
  SUPABASE_ANON_KEY: (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? extra.supabaseAnonKey ?? '') as string,
  THUNDERFOREST_API_KEY: (process.env.EXPO_PUBLIC_THUNDERFOREST_API_KEY ?? extra.thunderforestApiKey ?? '') as string,
} as const;

/** URL del tile de Thunderforest Outdoors para MapLibre */
export function thunderforestTileUrl(): string {
  return `https://tile.thunderforest.com/outdoors/{z}/{x}/{y}.png?apikey=${ENV.THUNDERFOREST_API_KEY}`;
}
