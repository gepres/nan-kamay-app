import { View, Text, TouchableOpacity, Modal, Share, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as SMS from 'expo-sms';
import { useUiStore } from '@presentation/stores/uiStore';
import { colors } from '@presentation/theme/colors';

/**
 * Bottom sheet genérico para compartir un mensaje por varios canales: WhatsApp,
 * SMS (a unos teléfonos dados), copiar (un texto/enlace) o el menú del sistema
 * (Telegram, correo, etc.). Lo usan el check-in/S.O.S. (PR1) y el seguimiento en
 * vivo (PR2). El padre construye el `message` (y los `smsPhones`) y lo abre.
 */
interface Props {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Texto completo a compartir (WhatsApp / SMS / sistema). */
  message: string;
  /** Teléfonos destino del SMS (`[]` → abre el compositor sin destinatario). */
  smsPhones: string[];
  /** Lo que copia "Copiar". Si falta, copia `message`. */
  copyText?: string;
  copyLabel?: string;
  copySub?: string;
  smsLabel?: string;
  smsSub?: string;
  /** Acción extra opcional al pie (p. ej. "Dejar de compartir en vivo"). */
  onStop?: () => void;
  stopLabel?: string;
}

export default function ShareMessageSheet({
  visible, onClose, title, subtitle, message, smsPhones,
  copyText, copyLabel = 'Copiar mensaje', copySub,
  smsLabel = 'SMS', smsSub, onStop, stopLabel = 'Detener',
}: Props) {
  const insets = useSafeAreaInsets();
  const { showToast } = useUiStore();

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
      const { result } = await SMS.sendSMSAsync(smsPhones, message);
      onClose();
      if (result === 'cancelled') showToast('Envío cancelado.', 'info');
      else showToast('SMS preparado.', 'success');
    } catch { showToast('No se pudo preparar el SMS.', 'error'); }
  };

  const viaCopy = async () => {
    try {
      await Clipboard.setStringAsync(copyText ?? message);
      showToast('Copiado.', 'success');
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
          <View style={{ alignItems: 'center', marginBottom: 6 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
          </View>

          <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '800' }}>{title}</Text>
          {subtitle ? (
            <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8, lineHeight: 17 }}>{subtitle}</Text>
          ) : <View style={{ height: 8 }} />}

          <Row icon="logo-whatsapp" color="#25D366" label="WhatsApp" sub="Elige a quién enviarlo" onPress={viaWhatsApp} />
          <Row icon="chatbubble-ellipses" color={colors.accent} label={smsLabel} sub={smsSub ?? 'Por mensaje de texto'} onPress={viaSms} />
          <Row icon="link" color={colors.textPrimary} label={copyLabel} sub={copySub ?? 'Para pegarlo donde quieras'} onPress={viaCopy} />
          <Row icon="share-social" color={colors.textPrimary} label="Más opciones…" sub="Telegram, correo, etc." onPress={viaSystem} />

          {onStop && (
            <TouchableOpacity
              onPress={onStop}
              activeOpacity={0.8}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.danger }}
            >
              <Ionicons name="stop-circle" size={18} color={colors.danger} />
              <Text style={{ color: colors.danger, fontSize: 14, fontWeight: '700' }}>{stopLabel}</Text>
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
