import { View, Text, TouchableOpacity, Modal, Share, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as SMS from 'expo-sms';
import { getTrustedContacts } from '@shared/utils/trustedContacts';
import { composeFollowMessage } from '@application/safety/buildLocationShare';
import { useUiStore } from '@presentation/stores/uiStore';
import { colors } from '@presentation/theme/colors';

/**
 * Bottom sheet para compartir el enlace de seguimiento en vivo (PR2) por varios
 * canales: WhatsApp, SMS a contactos de confianza, copiar enlace, o el menú del
 * sistema (Telegram, correo, etc.). Si se pasa `onStop`, ofrece dejar de compartir.
 */
interface Props {
  visible: boolean;
  token: string | null;
  ownerName: string;
  onClose: () => void;
  onStop?: () => void;
}

export default function ShareLiveLinkModal({ visible, token, ownerName, onClose, onStop }: Props) {
  const insets = useSafeAreaInsets();
  const { showToast } = useUiStore();

  if (!token) return null;
  const link = `nan-kamay://seguir/${token}`;
  const message = composeFollowMessage(token, ownerName);

  const viaWhatsApp = async () => {
    const url = `whatsapp://send?text=${encodeURIComponent(message)}`;
    try {
      if (!(await Linking.canOpenURL(url))) { showToast('WhatsApp no está instalado.', 'error'); return; }
      await Linking.openURL(url);
      onClose();
    } catch { showToast('No se pudo abrir WhatsApp.', 'error'); }
  };

  const viaSms = async () => {
    try {
      if (!(await SMS.isAvailableAsync())) { showToast('Este dispositivo no puede enviar SMS.', 'error'); return; }
      const contacts = await getTrustedContacts();
      await SMS.sendSMSAsync(contacts.map((c) => c.phone), message); // [] → abre el compositor sin destinatario
      onClose();
    } catch { showToast('No se pudo preparar el SMS.', 'error'); }
  };

  const viaCopy = async () => {
    try {
      await Clipboard.setStringAsync(link);
      showToast('Enlace copiado.', 'success');
      onClose();
    } catch { showToast('No se pudo copiar.', 'error'); }
  };

  const viaSystem = async () => {
    try { await Share.share({ message }); onClose(); } catch { /* cancelado por el usuario */ }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#00000099', justifyContent: 'flex-end' }}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />

        <View style={{
          backgroundColor: colors.bgPrimary,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          paddingTop: 12,
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 16,
          gap: 4,
        }}>
          {/* Handle */}
          <View style={{ alignItems: 'center', marginBottom: 6 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
          </View>

          <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '800' }}>Compartir en vivo</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8, lineHeight: 17 }}>
            Tu contacto abre el enlace en Ñan Kamay (Perfil › Seguridad › Seguir a un contacto) y te ve en tiempo real.
          </Text>

          <Row icon="logo-whatsapp" color="#25D366" label="WhatsApp" sub="Elige a quién enviarlo" onPress={viaWhatsApp} />
          <Row icon="chatbubble-ellipses" color={colors.accent} label="SMS a mis contactos" sub="A tus contactos de confianza" onPress={viaSms} />
          <Row icon="link" color={colors.textPrimary} label="Copiar enlace" sub="Para pegarlo donde quieras" onPress={viaCopy} />
          <Row icon="share-social" color={colors.textPrimary} label="Más opciones…" sub="Telegram, correo, etc." onPress={viaSystem} />

          {onStop && (
            <TouchableOpacity
              onPress={onStop}
              activeOpacity={0.8}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.danger }}
            >
              <Ionicons name="stop-circle" size={18} color={colors.danger} />
              <Text style={{ color: colors.danger, fontSize: 14, fontWeight: '700' }}>Dejar de compartir en vivo</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

function Row({ icon, color, label, sub, onPress }: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  label: string;
  sub: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 4 }}
    >
      <View style={{ width: 42, height: 42, borderRadius: 11, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={21} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '600' }}>{label}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}
