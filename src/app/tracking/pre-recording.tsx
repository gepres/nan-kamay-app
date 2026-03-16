import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTrackingStore } from '@presentation/stores/trackingStore';
import { Difficulty, DifficultyLabel } from '@core/value-objects/Difficulty';
import { gpsService } from '@infrastructure/services/GpsServiceImpl';
import { colors } from '@presentation/theme/colors';

const DIFFICULTIES: Difficulty[] = ['easy', 'moderate', 'hard'];

const difficultyColors: Record<Difficulty, string> = {
  easy: colors.easy,
  moderate: colors.medium,
  hard: colors.hard,
};

const ACTIVITY_TYPES = ['Senderismo', 'Ciclismo', 'Escalada'];

export default function PreRecordingScreen() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [activityType, setActivityType] = useState('Senderismo');
  const [checkingGps, setCheckingGps] = useState(false);
  const { startRecording } = useTrackingStore();

  const handleStart = async () => {
    if (!name.trim()) return;
    setCheckingGps(true);
    const granted = await gpsService.requestPermissions();
    setCheckingGps(false);

    if (!granted) {
      Alert.alert(
        'GPS requerido',
        'Ñan Kamay necesita acceso a tu ubicación para grabar la ruta. Habilítalo en Configuración → Privacidad → Ubicación.',
      );
      return;
    }

    startRecording(name.trim(), difficulty, description.trim(), activityType);
    router.replace('/tracking/active');
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
  } as const;

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
        {/* Header */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingTop: 20,
          marginBottom: 4,
        }}>
          <Text style={{ color: colors.textPrimary, fontSize: 28, fontWeight: '700' }}>
            Nueva Ruta
          </Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="close" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <Text style={{ color: colors.textSecondary, fontSize: 14, paddingHorizontal: 20, marginBottom: 28 }}>
          Configura los detalles de tu ruta antes de empezar a grabar.
        </Text>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Título */}
          <View>
            <Text style={labelStyle}>Título de la Ruta</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="ej. Camino Inca Día 2"
              placeholderTextColor={colors.textMuted}
              style={inputStyle}
            />
          </View>

          {/* Descripción */}
          <View>
            <Text style={labelStyle}>Descripción Breve</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Describe esta ruta..."
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              style={[inputStyle, { minHeight: 80 }]}
            />
          </View>

          {/* Dificultad */}
          <View>
            <Text style={labelStyle}>Dificultad</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {DIFFICULTIES.map((d) => (
                <TouchableOpacity
                  key={d}
                  onPress={() => setDifficulty(d)}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 10,
                    alignItems: 'center',
                    backgroundColor: difficulty === d ? difficultyColors[d] + '30' : 'transparent',
                    borderWidth: 1.5,
                    borderColor: difficulty === d ? difficultyColors[d] : colors.border,
                  }}
                >
                  <Text style={{
                    color: difficulty === d ? difficultyColors[d] : colors.textMuted,
                    fontWeight: '600',
                    fontSize: 13,
                  }}>
                    {DifficultyLabel[d]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Tipo de Actividad */}
          <View>
            <Text style={labelStyle}>Tipo de Actividad</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {ACTIVITY_TYPES.map((type) => (
                <TouchableOpacity
                  key={type}
                  onPress={() => setActivityType(type)}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 18,
                    borderRadius: 10,
                    backgroundColor: activityType === type ? colors.accent : 'transparent',
                    borderWidth: 1,
                    borderColor: activityType === type ? colors.accent : colors.border,
                  }}
                >
                  <Text style={{
                    color: activityType === type ? colors.bgPrimary : colors.textMuted,
                    fontWeight: activityType === type ? '600' : '500',
                    fontSize: 13,
                  }}>
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Botón iniciar */}
          <TouchableOpacity
            onPress={handleStart}
            disabled={!name.trim() || checkingGps}
            style={{
              backgroundColor: name.trim() ? colors.accent : colors.bgCard,
              borderRadius: 12,
              paddingVertical: 16,
              alignItems: 'center',
              marginTop: 8,
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 10,
            }}
          >
            {checkingGps ? (
              <ActivityIndicator color={colors.bgPrimary} />
            ) : (
              <>
                <Ionicons name="play-circle" size={22} color={name.trim() ? colors.bgPrimary : colors.textMuted} />
                <Text style={{
                  color: name.trim() ? colors.bgPrimary : colors.textMuted,
                  fontSize: 16,
                  fontWeight: '700',
                }}>
                  Iniciar Grabación
                </Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
