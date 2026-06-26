import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StatusBar, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { extractFollowToken, isValidFollowToken } from '@application/live/liveShareUseCases';
import { useUiStore } from '@presentation/stores/uiStore';
import { colors } from '@presentation/theme/colors';

/**
 * Entrada al visor de seguimiento en vivo pegando el enlace (PR2). La mayoría de
 * apps de SMS NO enlazan esquemas custom (`nan-kamay://`), así que el contacto
 * copia el enlace del mensaje y lo pega aquí. (Si su SMS sí lo enlaza, tocarlo
 * abre directamente `/seguir/TOKEN`.)
 */
export default function FollowEntryScreen() {
  const insets = useSafeAreaInsets();
  const { showToast } = useUiStore();
  const [value, setValue] = useState('');

  const paste = async () => {
    try {
      const t = await Clipboard.getStringAsync();
      if (t) setValue(t);
    } catch { /* sin portapapeles */ }
  };

  const follow = () => {
    const token = extractFollowToken(value);
    if (!token) { showToast('Pega el enlace que te enviaron.', 'error'); return; }
    if (!isValidFollowToken(token)) { showToast('Ese enlace no es válido.', 'error'); return; }
    router.push(`/seguir/${token}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '800', flex: 1 }}>Seguir a un contacto</Text>
        <Ionicons name="radio" size={22} color={colors.accent} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ padding: 16, gap: 14 }}>
          <View style={{ backgroundColor: colors.bgCard, borderRadius: 12, padding: 14, gap: 6, borderWidth: 1, borderColor: colors.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="information-circle-outline" size={18} color={colors.accent} />
              <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '700' }}>Pega el enlace que te enviaron</Text>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 17 }}>
              Tu contacto activó "Compartir en vivo" y te mandó un enlace por SMS. Cópialo del mensaje y pégalo aquí para ver su ubicación en tiempo real.
            </Text>
          </View>

          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder="nan-kamay://seguir/…"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            style={{ backgroundColor: colors.bgInput, borderRadius: 10, paddingHorizontal: 12, height: 48, color: colors.textPrimary, fontSize: 14, borderWidth: 1, borderColor: colors.border }}
          />

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity onPress={paste} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.bgCard, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.border }}>
              <Ionicons name="clipboard-outline" size={18} color={colors.textPrimary} />
              <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '700' }}>Pegar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={follow} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 13 }}>
              <Ionicons name="navigate" size={18} color="#0D1B12" />
              <Text style={{ color: '#0D1B12', fontSize: 14, fontWeight: '800' }}>Seguir</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
