import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useUiStore } from '@presentation/stores/uiStore';

/**
 * Detecta el estado online/offline de la red y actualiza el uiStore.
 * Retorna `true` si hay conexión a internet.
 */
export function useNetworkStatus(): boolean {
  const { setOffline } = useUiStore();
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = state.isConnected ?? false;
      setIsConnected(connected);
      setOffline(!connected);
    });

    // Verificar estado inicial
    NetInfo.fetch().then((state) => {
      const connected = state.isConnected ?? false;
      setIsConnected(connected);
      setOffline(!connected);
    });

    return () => unsubscribe();
  }, []);

  return isConnected;
}
