import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ScrollView, StatusBar, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as SMS from 'expo-sms';
import {
  getTrustedContacts, addTrustedContact, removeTrustedContact, type TrustedContact,
} from '@shared/utils/trustedContacts';
import { buildLocationShare, composeSafetyMessage } from '@application/safety/buildLocationShare';
import { useUiStore } from '@presentation/stores/uiStore';
import { colors } from '@presentation/theme/colors';

export default function SafetyScreen() {
  const insets = useSafeAreaInsets();
  const { showToast } = useUiStore();

  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState<null | 'checkin' | 'sos'>(null);

  const load = useCallback(() => {
    getTrustedContacts().then((list) => {
      setContacts(list);
      setSelected(new Set(list.map((c) => c.id))); // por defecto, todos seleccionados
    }).catch(() => {});
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { load(); }, [load]);

  const toggle = (id: string) => setSelected((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const handleAdd = async () => {
    if (!phone.trim()) { showToast('Ingresa un número de teléfono.', 'error'); return; }
    const next = await addTrustedContact(name, phone);
    setContacts(next);
    setSelected(new Set(next.map((c) => c.id)));
    setName(''); setPhone('');
  };

  const handleRemove = (c: TrustedContact) => {
    Alert.alert('Quitar contacto', `¿Quitar a "${c.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar', style: 'destructive',
        onPress: async () => { setContacts(await removeTrustedContact(c.id)); },
      },
    ]);
  };

  const handleSend = async (kind: 'checkin' | 'sos') => {
    const phones = contacts.filter((c) => selected.has(c.id)).map((c) => c.phone);
    if (phones.length === 0) { showToast('Selecciona al menos un contacto.', 'error'); return; }
    setSending(kind);
    try {
      if (!(await SMS.isAvailableAsync())) {
        showToast('Este dispositivo no puede enviar SMS.', 'error');
        return;
      }
      const share = await buildLocationShare();
      const message = composeSafetyMessage(share, kind);
      const { result } = await SMS.sendSMSAsync(phones, message);
      if (result === 'cancelled') showToast('Envío cancelado.', 'info');
      else showToast('SMS preparado con tu ubicación.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo preparar el SMS.', 'error');
    } finally {
      setSending(null);
    }
  };

  const noContacts = contacts.length === 0;
  const noneSelected = selected.size === 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Header */}
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '800', flex: 1 }}>Seguridad</Text>
        <Ionicons name="shield-checkmark" size={22} color={colors.accent} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24, gap: 14 }} keyboardShouldPersistTaps="handled">
          {/* Intro */}
          <View style={{ backgroundColor: colors.bgCard, borderRadius: 12, padding: 14, gap: 6, borderWidth: 1, borderColor: colors.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="location" size={18} color={colors.accent} />
              <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '700' }}>Avisa dónde estás</Text>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 17 }}>
              Manda tu ubicación a tus contactos por SMS. Funciona sin datos (basta señal de teléfono) y el GPS no necesita internet. Se abrirá el SMS con el mensaje listo; tú confirmas el envío.
            </Text>
          </View>

          {/* Enviar ahora */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              onPress={() => handleSend('checkin')}
              disabled={noContacts || noneSelected || sending !== null}
              style={{
                flex: 1, backgroundColor: colors.success, borderRadius: 14, paddingVertical: 16,
                alignItems: 'center', justifyContent: 'center', gap: 6, flexDirection: 'row',
                opacity: (noContacts || noneSelected || sending !== null) ? 0.5 : 1,
              }}
            >
              {sending === 'checkin' ? <ActivityIndicator color="#0D1B12" size="small" /> : <Ionicons name="checkmark-circle" size={20} color="#0D1B12" />}
              <Text style={{ color: '#0D1B12', fontSize: 15, fontWeight: '800' }}>Estoy bien</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleSend('sos')}
              disabled={noContacts || noneSelected || sending !== null}
              style={{
                flex: 1, backgroundColor: colors.danger, borderRadius: 14, paddingVertical: 16,
                alignItems: 'center', justifyContent: 'center', gap: 6, flexDirection: 'row',
                opacity: (noContacts || noneSelected || sending !== null) ? 0.5 : 1,
              }}
            >
              {sending === 'sos' ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="warning" size={20} color="#fff" />}
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>S.O.S.</Text>
            </TouchableOpacity>
          </View>
          {noContacts && (
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: -6, marginLeft: 4 }}>
              Añade al menos un contacto de confianza para poder enviar.
            </Text>
          )}

          {/* Contactos */}
          <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '800', marginTop: 4 }}>Contactos de confianza</Text>
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: -8 }}>Se guardan solo en este teléfono. Toca para incluir/excluir del envío.</Text>

          {contacts.map((c) => {
            const on = selected.has(c.id);
            return (
              <TouchableOpacity
                key={c.id} activeOpacity={0.8} onPress={() => toggle(c.id)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.bgCard,
                  borderRadius: 12, padding: 12, borderWidth: 1, borderColor: on ? colors.accent : colors.border,
                }}
              >
                <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? colors.accent : colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>{c.name}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>{c.phone}</Text>
                </View>
                <TouchableOpacity onPress={() => handleRemove(c)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="trash-outline" size={20} color={colors.danger} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })}

          {/* Añadir contacto */}
          <View style={{ backgroundColor: colors.bgCard, borderRadius: 12, padding: 12, gap: 10, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700' }}>Añadir contacto</Text>
            <TextInput
              value={name} onChangeText={setName}
              placeholder="Nombre (ej. Mamá)" placeholderTextColor={colors.textMuted}
              style={{ backgroundColor: colors.bgInput, borderRadius: 10, paddingHorizontal: 12, height: 44, color: colors.textPrimary, fontSize: 14, borderWidth: 1, borderColor: colors.border }}
            />
            <TextInput
              value={phone} onChangeText={setPhone}
              placeholder="Teléfono (ej. +51987654321)" placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
              style={{ backgroundColor: colors.bgInput, borderRadius: 10, paddingHorizontal: 12, height: 44, color: colors.textPrimary, fontSize: 14, borderWidth: 1, borderColor: colors.border }}
            />
            <TouchableOpacity
              onPress={handleAdd}
              style={{ backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <Ionicons name="person-add" size={18} color="#0D1B12" />
              <Text style={{ color: '#0D1B12', fontSize: 14, fontWeight: '700' }}>Añadir</Text>
            </TouchableOpacity>
          </View>

          {/* Nota */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 4, marginTop: 2 }}>
            <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} style={{ marginTop: 1 }} />
            <Text style={{ color: colors.textMuted, fontSize: 11, lineHeight: 16, flex: 1 }}>
              El "S.O.S." y el "Estoy bien" envían el mismo enlace de mapa con tu última posición; cambia solo el texto. Para seguimiento en vivo (con datos) viene en una próxima versión.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
