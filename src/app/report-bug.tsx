import { useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ScrollView, StatusBar, Image, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { submitBugReport } from '@application/feedback/submitBugReport';
import { trackEvent } from '@infrastructure/services/AnalyticsService';
import { useAuthStore } from '@presentation/stores/authStore';
import { useUiStore } from '@presentation/stores/uiStore';
import { colors } from '@presentation/theme/colors';

const CATEGORIES = ['Falla / cierre', 'GPS', 'Mapa', 'Sincronización', 'Otro'];

export default function ReportBugScreen() {
  const insets = useSafeAreaInsets();
  const { showToast } = useUiStore();
  const { user } = useAuthStore();
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [message, setMessage] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const pickImage = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
      });
      if (!res.canceled && res.assets?.[0]) setImageUri(res.assets[0].uri);
    } catch {
      showToast('No se pudo abrir la galería.', 'error');
    }
  };

  const send = async () => {
    if (!message.trim()) { showToast('Describe el problema.', 'error'); return; }
    if (!user) { showToast('Inicia sesión para reportar.', 'error'); return; }
    setSending(true);
    try {
      await submitBugReport({ category, message, imageUri }, user.id);
      trackEvent('bug_report_submitted', { category, has_image: !!imageUri });
      showToast('¡Gracias! Reporte enviado.', 'success');
      router.back();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo enviar.', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Header */}
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '800', flex: 1 }}>Reportar un problema</Text>
        <Ionicons name="bug" size={22} color={colors.accent} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24, gap: 14 }} keyboardShouldPersistTaps="handled">
          <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 17 }}>
            Cuéntanos qué pasó. Se envía la versión de la app y el sistema operativo para ayudarnos a reproducirlo. No se envía tu ubicación.
          </Text>

          {/* Categoría */}
          <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700' }}>Categoría</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {CATEGORIES.map((c) => {
              const on = c === category;
              return (
                <TouchableOpacity
                  key={c}
                  onPress={() => setCategory(c)}
                  style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: on ? colors.accentSoft : colors.bgCard, borderWidth: 1, borderColor: on ? colors.accent : colors.border }}
                >
                  <Text style={{ color: on ? colors.accent : colors.textSecondary, fontSize: 13, fontWeight: '600' }}>{c}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Mensaje */}
          <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700' }}>¿Qué pasó?</Text>
          <TextInput
            value={message} onChangeText={setMessage}
            placeholder="Describe el problema, qué esperabas y qué pasó…" placeholderTextColor={colors.textMuted}
            multiline numberOfLines={6} textAlignVertical="top"
            style={{ backgroundColor: colors.bgInput, borderRadius: 12, padding: 12, minHeight: 130, color: colors.textPrimary, fontSize: 14, borderWidth: 1, borderColor: colors.border }}
          />

          {/* Captura opcional */}
          <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700' }}>Captura (opcional)</Text>
          {imageUri ? (
            <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
              <Image source={{ uri: imageUri }} style={{ width: '100%', height: 200 }} resizeMode="cover" />
              <TouchableOpacity onPress={() => setImageUri(null)} style={{ position: 'absolute', top: 8, right: 8, backgroundColor: '#0D1B12CC', borderRadius: 16, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="close" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={pickImage} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.bgCard, borderRadius: 12, paddingVertical: 14, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' }}>
              <Ionicons name="image-outline" size={20} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: '600' }}>Adjuntar una captura</Text>
            </TouchableOpacity>
          )}
          <Text style={{ color: colors.textMuted, fontSize: 11 }}>
            Tip: toma la captura con tu teléfono (volumen + encendido) y adjúntala aquí.
          </Text>

          {/* Enviar */}
          <TouchableOpacity
            onPress={send} disabled={sending}
            style={{ backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: sending ? 0.6 : 1, marginTop: 4 }}
          >
            {sending ? <ActivityIndicator color="#0D1B12" /> : <Ionicons name="send" size={18} color="#0D1B12" />}
            <Text style={{ color: '#0D1B12', fontSize: 15, fontWeight: '800' }}>Enviar reporte</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
