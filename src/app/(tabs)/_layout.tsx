import { Redirect, Tabs } from 'expo-router';
import { useAuthStore } from '@presentation/stores/authStore';
import TabBar from '@presentation/components/ui/TabBar';

export default function TabsLayout() {
  // Guard reactivo: si la sesión se invalida estando dentro de tabs
  // (SIGNED_OUT / token expirado), el authStore pone user = null y este
  // layout re-renderiza redirigiendo a login.
  const user = useAuthStore((s) => s.user);

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: 'Inicio' }} />
      <Tabs.Screen name="explore" options={{ title: 'Explorar' }} />
      <Tabs.Screen name="profile" options={{ title: 'Perfil' }} />
    </Tabs>
  );
}
