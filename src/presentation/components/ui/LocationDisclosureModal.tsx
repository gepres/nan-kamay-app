import { create } from 'zustand';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@presentation/theme/colors';

/**
 * Aviso prominente de ubicación en segundo plano (requisito de Google Play).
 *
 * Play exige mostrar una explicación in-app ANTES de solicitar el permiso de
 * ubicación en segundo plano. Este módulo expone `ensureBgLocationDisclosed()`:
 * si el permiso de fondo aún NO está concedido (habrá prompt del sistema),
 * muestra el aviso y resuelve `true` solo si el usuario toca "Continuar".
 *
 * Patrón imperativo (promesa) para no duplicar JSX de modal en cada pantalla:
 * el modal se monta UNA vez en el layout raíz (`<LocationDisclosureModal />`).
 */
interface DisclosureState {
  visible: boolean;
  _resolve: ((ok: boolean) => void) | null;
  show: () => Promise<boolean>;
  answer: (ok: boolean) => void;
}

const useDisclosureStore = create<DisclosureState>((set, get) => ({
  visible: false,
  _resolve: null,
  show: () =>
    new Promise<boolean>((resolve) => {
      set({ visible: true, _resolve: resolve });
    }),
  answer: (ok) => {
    const resolve = get()._resolve;
    set({ visible: false, _resolve: null });
    resolve?.(ok);
  },
}));

/**
 * Garantiza que se mostró el aviso de ubicación en segundo plano antes de pedir
 * el permiso. Devuelve `true` si se puede continuar (ya concedido, o el usuario
 * acepta el aviso); `false` si el usuario declina.
 */
export async function ensureBgLocationDisclosed(): Promise<boolean> {
  try {
    const { status } = await Location.getBackgroundPermissionsAsync();
    // Ya concedido → no habrá prompt del sistema → no hace falta el aviso.
    if (status === 'granted') return true;
  } catch {
    // Si la consulta falla, mostramos el aviso igual (más seguro para Play).
  }
  return useDisclosureStore.getState().show();
}

/** Modal global. Montar UNA sola vez en el layout raíz. */
export function LocationDisclosureModal() {
  const visible = useDisclosureStore((s) => s.visible);
  const answer = useDisclosureStore((s) => s.answer);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => answer(false)}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="location" size={28} color={colors.accent} />
          </View>
          <Text style={styles.title}>Ubicación en segundo plano</Text>
          <Text style={styles.body}>
            Ñan Kamay registra tu ubicación —incluso con la pantalla apagada o la app en segundo
            plano— para grabar tu ruta sin cortes.{'\n\n'}
            La ubicación solo se registra mientras grabas y nunca se comparte sin tu permiso.
          </Text>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => answer(true)}
            accessibilityRole="button"
          >
            <Text style={styles.primaryTxt}>Continuar</Text>
          </Pressable>
          <Pressable
            style={styles.ghostBtn}
            onPress={() => answer(false)}
            accessibilityRole="button"
          >
            <Text style={styles.ghostTxt}>Ahora no</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.bgCard,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 19,
    fontWeight: '800',
    marginBottom: 8,
  },
  body: {
    color: colors.textSecondary,
    fontSize: 14.5,
    lineHeight: 21,
    marginBottom: 20,
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryTxt: {
    color: colors.bgPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  ghostBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  ghostTxt: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
});
