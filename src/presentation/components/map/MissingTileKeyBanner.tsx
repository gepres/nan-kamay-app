import { View, Text } from 'react-native';
import { ENV } from '@infrastructure/config/env';

/**
 * Aviso visible cuando falta la API key de Thunderforest. Sin esto el mapa
 * queda gris en silencio (los errores de tile se silencian por diseño en
 * `Logger.setLogCallback`), sin que el usuario sepa por qué (M14).
 */
export default function MissingTileKeyBanner() {
  if (ENV.THUNDERFOREST_API_KEY) return null;
  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        backgroundColor: '#EF4444',
        paddingVertical: 8,
        paddingHorizontal: 12,
        zIndex: 10,
      }}
    >
      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600', textAlign: 'center' }}>
        Falta EXPO_PUBLIC_THUNDERFOREST_API_KEY — el mapa no cargará
      </Text>
    </View>
  );
}
