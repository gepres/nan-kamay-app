import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import { useAuthStore } from '@presentation/stores/authStore';
import { supabase } from '@infrastructure/supabase/supabaseClient';
import { initDatabase } from '@infrastructure/database/sqliteDb';
import { User } from '@core/entities/User';
import ToastContainer from '@presentation/components/ui/ToastContainer';

async function handleAuthDeepLink(url: string) {
  // El link de confirmación llega como: nan-kamay://#access_token=...&type=signup
  const fragment = url.split('#')[1];
  if (!fragment) return;

  const params = new URLSearchParams(fragment);
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');

  if (access_token && refresh_token) {
    await supabase.auth.setSession({ access_token, refresh_token });
  }
}

export default function RootLayout() {
  const { setUser, setLoading } = useAuthStore();

  useEffect(() => {
    // Inicializar base de datos SQLite
    initDatabase().catch(console.error);

    // Manejar deep link si la app se abrió desde el email de confirmación
    Linking.getInitialURL().then((url) => {
      if (url) handleAuthDeepLink(url);
    });

    // Manejar deep link si la app ya estaba abierta
    const linkSubscription = Linking.addEventListener('url', ({ url }) => {
      handleAuthDeepLink(url);
    });

    // Escuchar cambios de autenticación en Supabase
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'TOKEN_REFRESHED' && !session) {
          // Token inválido/expirado — limpiar sesión y redirigir a login
          await supabase.auth.signOut();
          setUser(null);
          setLoading(false);
          return;
        }
        if (session?.user) {
          const user = User.fromProps({
            id: session.user.id,
            email: session.user.email ?? '',
            fullName: session.user.user_metadata?.full_name ?? '',
            avatarUrl: session.user.user_metadata?.avatar_url ?? null,
            createdAt: new Date(session.user.created_at),
          });
          setUser(user);
        } else {
          setUser(null);
        }
        setLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
      linkSubscription.remove();
    };
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="light" backgroundColor="#0D1B12" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="tracking/pre-recording"
          options={{ presentation: 'modal' }}
        />
        <Stack.Screen name="tracking/active" />
        <Stack.Screen
          name="tracking/summary"
          options={{ presentation: 'card' }}
        />
      </Stack>
      <ToastContainer />
    </View>
  );
}
