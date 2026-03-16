import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@infrastructure/supabase/supabaseClient';

export default function RegisterScreen() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!fullName || !email || !password) {
      Alert.alert('Error', 'Por favor completa todos los campos.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Error', 'La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    setLoading(false);
    if (error) {
      Alert.alert('Error al registrarse', error.message);
    } else {
      Alert.alert(
        '¡Registro exitoso!',
        'Revisa tu correo para confirmar tu cuenta.',
        [{ text: 'OK', onPress: () => router.replace('/(auth)/login') }]
      );
    }
  };

  const inputStyle = {
    backgroundColor: '#152219',
    borderColor: '#2D6A4F',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#E8F5E9',
    fontSize: 16,
  };

  const labelStyle = {
    color: '#6B8F71',
    fontSize: 12,
    fontWeight: '500' as const,
    marginBottom: 6,
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0D1B12' }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ marginBottom: 40, alignItems: 'center' }}>
            <Text style={{ color: '#22C55E', fontSize: 28, fontWeight: '700' }}>
              Crear cuenta
            </Text>
            <Text style={{ color: '#6B8F71', fontSize: 14, marginTop: 8 }}>
              Únete a Ñan Kamay
            </Text>
          </View>

          <View style={{ marginBottom: 16 }}>
            <Text style={labelStyle}>Nombre completo</Text>
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              placeholder="Tu nombre"
              placeholderTextColor="#6B8F71"
              style={inputStyle}
            />
          </View>

          <View style={{ marginBottom: 16 }}>
            <Text style={labelStyle}>Correo electrónico</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="tu@correo.com"
              placeholderTextColor="#6B8F71"
              style={inputStyle}
            />
          </View>

          <View style={{ marginBottom: 28 }}>
            <Text style={labelStyle}>Contraseña</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Mínimo 8 caracteres"
              placeholderTextColor="#6B8F71"
              style={inputStyle}
            />
          </View>

          <TouchableOpacity
            onPress={handleRegister}
            disabled={loading}
            style={{
              backgroundColor: '#22C55E',
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: 'center',
              marginBottom: 24,
            }}
          >
            {loading ? (
              <ActivityIndicator color="#0D1B12" />
            ) : (
              <Text style={{ color: '#0D1B12', fontSize: 16, fontWeight: '600' }}>
                Registrarme
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: '#6B8F71', textAlign: 'center', fontSize: 14 }}>
              ¿Ya tienes cuenta?{' '}
              <Text style={{ color: '#22C55E', fontWeight: '600' }}>Iniciar sesión</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
