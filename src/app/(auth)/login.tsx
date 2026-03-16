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
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@infrastructure/supabase/supabaseClient';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Por favor ingresa email y contraseña.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      Alert.alert('Error al iniciar sesión', error.message);
    }
    // La redirección la maneja _layout.tsx via onAuthStateChange
  };

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
    if (error) Alert.alert('Error', error.message);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0D1B12' }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 20 }}>
          {/* Logo / título */}
          <View style={{ marginBottom: 48, alignItems: 'center' }}>
            <Text style={{ color: '#22C55E', fontSize: 32, fontWeight: '700' }}>
              Ñan Kamay
            </Text>
            <Text style={{ color: '#6B8F71', fontSize: 14, marginTop: 8 }}>
              El camino de la mano
            </Text>
          </View>

          {/* Email */}
          <View style={{ marginBottom: 16 }}>
            <Text style={{ color: '#6B8F71', fontSize: 12, fontWeight: '500', marginBottom: 6 }}>
              Correo electrónico
            </Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="tu@correo.com"
              placeholderTextColor="#6B8F71"
              style={{
                backgroundColor: '#152219',
                borderColor: '#2D6A4F',
                borderWidth: 1,
                borderRadius: 10,
                paddingHorizontal: 16,
                paddingVertical: 14,
                color: '#E8F5E9',
                fontSize: 16,
              }}
            />
          </View>

          {/* Contraseña */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ color: '#6B8F71', fontSize: 12, fontWeight: '500', marginBottom: 6 }}>
              Contraseña
            </Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor="#6B8F71"
              style={{
                backgroundColor: '#152219',
                borderColor: '#2D6A4F',
                borderWidth: 1,
                borderRadius: 10,
                paddingHorizontal: 16,
                paddingVertical: 14,
                color: '#E8F5E9',
                fontSize: 16,
              }}
            />
          </View>

          {/* Botón login */}
          <TouchableOpacity
            onPress={handleLogin}
            disabled={loading}
            style={{
              backgroundColor: '#22C55E',
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            {loading ? (
              <ActivityIndicator color="#0D1B12" />
            ) : (
              <Text style={{ color: '#0D1B12', fontSize: 16, fontWeight: '600' }}>
                Iniciar sesión
              </Text>
            )}
          </TouchableOpacity>

          {/* Separador */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 16 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: '#2D6A4F' }} />
            <Text style={{ color: '#6B8F71', marginHorizontal: 12, fontSize: 13 }}>o</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: '#2D6A4F' }} />
          </View>

          {/* Botón Google */}
          <TouchableOpacity
            onPress={handleGoogleLogin}
            style={{
              backgroundColor: 'transparent',
              borderColor: '#22C55E',
              borderWidth: 1.5,
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: 'center',
              marginBottom: 32,
            }}
          >
            <Text style={{ color: '#22C55E', fontSize: 16, fontWeight: '600' }}>
              Continuar con Google
            </Text>
          </TouchableOpacity>

          {/* Ir a registro */}
          <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
            <Text style={{ color: '#6B8F71', textAlign: 'center', fontSize: 14 }}>
              ¿No tienes cuenta?{' '}
              <Text style={{ color: '#22C55E', fontWeight: '600' }}>Regístrate</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
