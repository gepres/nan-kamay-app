import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { ENV } from '../config/env';

// Adaptador de SecureStore para que Supabase persista la sesión de forma segura
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // PKCE: el flujo OAuth (Google) devuelve ?code=; se intercambia
    // manualmente con exchangeCodeForSession (ver googleAuth.ts).
    flowType: 'pkce',
  },
});
