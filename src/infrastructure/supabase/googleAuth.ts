import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from './supabaseClient';

// Cierra cualquier sesión de auth pendiente del navegador (no-op en native).
WebBrowser.maybeCompleteAuthSession();

export type GoogleSignInResult = 'success' | 'cancelled';

/**
 * Inicia sesión con Google (OAuth PKCE) usando un navegador in-app.
 *
 * Requiere configuración en Supabase Dashboard:
 *  - Auth → Providers → Google: habilitado con Client ID/Secret.
 *  - Auth → URL Configuration → Redirect URLs: añadir `nan-kamay://auth-callback`.
 *
 * Flujo: signInWithOAuth(skipBrowserRedirect) → abre data.url en WebBrowser →
 * el redirect vuelve con `?code=` → exchangeCodeForSession → onAuthStateChange
 * (en _layout.tsx) hidrata el authStore.
 */
export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  const redirectTo = Linking.createURL('auth-callback'); // nan-kamay://auth-callback

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('No se pudo iniciar el flujo de Google.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type === 'cancel' || result.type === 'dismiss') {
    return 'cancelled';
  }
  if (result.type !== 'success' || !result.url) {
    throw new Error('No se completó el inicio de sesión con Google.');
  }

  const parsed = Linking.parse(result.url);
  const code = parsed.queryParams?.code;
  if (typeof code === 'string' && code.length > 0) {
    const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
    if (exErr) throw exErr;
    return 'success';
  }

  // Fallback flujo implícito (#access_token=...)
  const hash = result.url.split('#')[1];
  if (hash) {
    const p = new URLSearchParams(hash);
    const access_token = p.get('access_token');
    const refresh_token = p.get('refresh_token');
    if (access_token && refresh_token) {
      const { error: sErr } = await supabase.auth.setSession({ access_token, refresh_token });
      if (sErr) throw sErr;
      return 'success';
    }
  }

  throw new Error('No se recibió el código de autenticación de Google.');
}
