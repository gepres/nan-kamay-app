import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '@presentation/stores/authStore';
import { supabase } from '@infrastructure/supabase/supabaseClient';
import { initDatabase } from '@infrastructure/database/sqliteDb';
import { User } from '@core/entities/User';
import ToastContainer from '@presentation/components/ui/ToastContainer';

// IMPORTANTE: Importar el GpsServiceImpl aquí para registrar el TaskManager
// background task antes de que la app arranque completamente.
import '@infrastructure/services/GpsServiceImpl';

export default function RootLayout() {
  const { setUser, setLoading } = useAuthStore();

  useEffect(() => {
    // Inicializar base de datos SQLite
    initDatabase().catch(console.error);

    // Escuchar cambios de autenticación en Supabase
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
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

    return () => subscription.unsubscribe();
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
