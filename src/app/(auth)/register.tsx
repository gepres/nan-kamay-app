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
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@infrastructure/supabase/supabaseClient';
import { colors } from '@presentation/theme/colors';

export default function RegisterScreen() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!fullName || !email || !password || !confirmPassword) {
      Alert.alert('Error', 'Por favor completa todos los campos.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Error', 'La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Las contraseñas no coinciden.');
      return;
    }
    if (!termsAccepted) {
      Alert.alert('Error', 'Debes aceptar los Términos y Condiciones.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: 'nan-kamay://',
      },
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

  const handleGoogleRegister = async () => {
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
  };

  const labelStyle = {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '500' as const,
    marginBottom: 6,
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 32 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Brand */}
          <View style={{ alignItems: 'center', marginBottom: 32, gap: 8 }}>
            <View style={{
              width: 60,
              height: 60,
              borderRadius: 30,
              backgroundColor: colors.accent,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Ionicons name="trail-sign" size={30} color={colors.bgPrimary} />
            </View>
            <Text style={{ color: colors.accent, fontSize: 20, fontWeight: '700', letterSpacing: 3 }}>
              ÑAN KAMAY
            </Text>
          </View>

          {/* Título */}
          <Text style={{ color: colors.textPrimary, fontSize: 28, fontWeight: '700', marginBottom: 4 }}>
            Crear Cuenta
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 24 }}>
            Únete y empieza a registrar tus rutas
          </Text>

          {/* Nombre */}
          <View style={{ marginBottom: 16 }}>
            <Text style={labelStyle}>Nombre Completo</Text>
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              placeholder="Tu nombre"
              placeholderTextColor={colors.textMuted}
              style={inputStyle}
            />
          </View>

          {/* Email */}
          <View style={{ marginBottom: 16 }}>
            <Text style={labelStyle}>Correo Electrónico</Text>
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

          {/* Contraseña */}
          <View style={{ marginBottom: 16 }}>
            <Text style={labelStyle}>Contraseña</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                placeholder="Mínimo 8 caracteres"
                placeholderTextColor={colors.textMuted}
                style={inputStyle}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: 14, padding: 4 }}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={colors.textMuted}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Confirmar Contraseña */}
          <View style={{ marginBottom: 20 }}>
            <Text style={labelStyle}>Confirmar Contraseña</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
                placeholder="Repite tu contraseña"
                placeholderTextColor={colors.textMuted}
                style={inputStyle}
              />
              <TouchableOpacity
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                style={{ position: 'absolute', right: 14, padding: 4 }}
              >
                <Ionicons
                  name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={colors.textMuted}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Terms */}
          <TouchableOpacity
            onPress={() => setTermsAccepted(!termsAccepted)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 24 }}
          >
            <View style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              borderWidth: 1.5,
              borderColor: termsAccepted ? colors.accent : colors.border,
              backgroundColor: termsAccepted ? colors.accent : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {termsAccepted && <Ionicons name="checkmark" size={12} color={colors.bgPrimary} />}
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              Acepto los{' '}
              <Text style={{ color: colors.accent }}>Términos y Condiciones</Text>
            </Text>
          </TouchableOpacity>

          {/* Botón Crear Cuenta */}
          <TouchableOpacity
            onPress={handleRegister}
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
                Crear Cuenta
              </Text>
            )}
          </TouchableOpacity>

          {/* Divider */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            <Text style={{ color: colors.textMuted, marginHorizontal: 12, fontSize: 13 }}>o</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          </View>

          {/* Google */}
          <TouchableOpacity
            onPress={handleGoogleRegister}
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

          {/* Link login */}
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: colors.textSecondary, textAlign: 'center', fontSize: 14 }}>
              ¿Ya tienes cuenta?{' '}
              <Text style={{ color: colors.accent, fontWeight: '600' }}>Inicia Sesión</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
