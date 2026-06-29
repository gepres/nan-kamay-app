import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '@infrastructure/supabase/supabaseClient';
import { useAuthStore } from '@presentation/stores/authStore';
import { colors } from '@presentation/theme/colors';

/**
 * Destino del redirect de OAuth: `nan-kamay://auth-callback?code=...`.
 *
 * Sin esta ruta, Expo Router muestra "Unmatched Route" tras el login con Google
 * (el redirect del navegador se filtra al sistema en vez de cerrarse dentro de
 * `openAuthSessionAsync`). Aquí canjeamos el `code` (PKCE) por una sesión si aún
 * no está activa y redirigimos a la app. El canje es idempotente: si otro handler
 * (`googleAuth.ts` o el listener de `_layout`) ya lo usó, basta con que exista
 * sesión.
 */
export default function AuthCallback() {
  const params = useLocalSearchParams<{ code?: string; error?: string; error_description?: string }>();
  const user = useAuthStore((s) => s.user);
  const [failed, setFailed] = useState(false);

  // Canjea el código una sola vez.
  useEffect(() => {
    (async () => {
      try {
        if (params.error) throw new Error(String(params.error_description || params.error));
        const { data: { session } } = await supabase.auth.getSession();
        if (!session && typeof params.code === 'string' && params.code) {
          const { error } = await supabase.auth.exchangeCodeForSession(params.code);
          if (error) {
            // Carrera con otro handler: si el code ya se usó pero hay sesión, OK.
            const { data: { session: after } } = await supabase.auth.getSession();
            if (!after) throw error;
          }
        }
      } catch {
        setFailed(true);
      }
    })();
    // Solo al montar: los params del deep link no cambian en esta pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redirige reactivamente: a tabs cuando el authStore se hidrata, a login si
  // falla; con un tope de seguridad por si nada llega.
  useEffect(() => {
    if (user) { router.replace('/(tabs)'); return; }
    if (failed) { router.replace('/(auth)/login'); return; }
    const t = setTimeout(() => router.replace('/(auth)/login'), 8000);
    return () => clearTimeout(t);
  }, [user, failed]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgPrimary, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator color={colors.accent} size="large" />
    </View>
  );
}
