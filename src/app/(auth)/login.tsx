import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@infrastructure/supabase/supabaseClient';
import { colors } from '@presentation/theme/colors';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    } else {
      router.replace('/(tabs)');
    }
  };

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
    if (error) Alert.alert('Error', error.message);
  };

  const inputStyle = {
    backgroundColor: colors.bgInput,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: colors.textPrimary,
    fontSize: 16,
    flex: 1,
    height: 52,
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 20 }}>
          {/* Brand */}
          <View style={{ marginBottom: 48, alignItems: 'center', gap: 8 }}>
            <View style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: colors.accent,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Ionicons name="trail-sign" size={36} color={colors.bgPrimary} />
            </View>
            <Text style={{ color: colors.accent, fontSize: 24, fontWeight: '700', letterSpacing: 3 }}>
              ÑAN KAMAY
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
              Registra tus rutas ancestrales
            </Text>
          </View>

          <Text style={{ color: colors.textPrimary, fontSize: 28, fontWeight: '700', marginBottom: 24 }}>
            Iniciar Sesión
          </Text>

          {/* Email */}
          <View style={{ marginBottom: 16 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '500', marginBottom: 6 }}>
              Correo Electrónico
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="tu@email.com"
                placeholderTextColor={colors.textMuted}
                style={inputStyle}
              />
            </View>
          </View>

          {/* Contraseña */}
          <View style={{ marginBottom: 8 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '500', marginBottom: 6 }}>
              Contraseña
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                style={inputStyle}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: 14,
                  padding: 4,
                }}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={colors.textMuted}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Olvidé mi contraseña */}
          <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '500', textAlign: 'right', marginBottom: 24 }}>
            ¿Olvidaste tu contraseña?
          </Text>

          {/* Botón login */}
          <TouchableOpacity
            onPress={handleLogin}
            disabled={loading}
            style={{
              backgroundColor: colors.accent,
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: 'center',
              marginBottom: 16,
            }}
          >
            {loading ? (
              <ActivityIndicator color={colors.bgPrimary} />
            ) : (
              <Text style={{ color: colors.bgPrimary, fontSize: 16, fontWeight: '600' }}>
                Iniciar Sesión
              </Text>
            )}
          </TouchableOpacity>

          {/* Separador */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            <Text style={{ color: colors.textMuted, marginHorizontal: 12, fontSize: 13 }}>o</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          </View>

          {/* Botón Google */}
          <TouchableOpacity
            onPress={handleGoogleLogin}
            style={{
              backgroundColor: colors.bgCard,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 10,
              marginBottom: 32,
            }}
          >
            <Ionicons name="globe-outline" size={20} color={colors.textPrimary} />
            <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '500' }}>Google</Text>
          </TouchableOpacity>

          {/* Ir a registro */}
          <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
            <Text style={{ color: colors.textSecondary, textAlign: 'center', fontSize: 14 }}>
              ¿No tienes cuenta?{' '}
              <Text style={{ color: colors.accent, fontWeight: '600' }}>Regístrate</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
