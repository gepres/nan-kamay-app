import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTrackingStore } from '@presentation/stores/trackingStore';
import { Difficulty, DifficultyLabel } from '@core/value-objects/Difficulty';
import { gpsService } from '@infrastructure/services/GpsServiceImpl';

const DIFFICULTIES: Difficulty[] = ['easy', 'moderate', 'hard'];

const difficultyColors: Record<Difficulty, string> = {
  easy: '#4ADE80',
  moderate: '#F59E0B',
  hard: '#EF4444',
};

export default function PreRecordingScreen() {
  const [name, setName] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
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

    startRecording(name.trim(), difficulty);
    router.replace('/tracking/active');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0D1B12' }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingTop: 20,
          marginBottom: 32,
        }}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="close" size={24} color="#6B8F71" />
          </TouchableOpacity>
          <Text style={{ color: '#E8F5E9', fontSize: 18, fontWeight: '700', marginLeft: 16 }}>
            Nueva ruta
          </Text>
        </View>

        <View style={{ paddingHorizontal: 20, gap: 24 }}>
          {/* Nombre */}
          <View>
            <Text style={{ color: '#6B8F71', fontSize: 12, fontWeight: '500', marginBottom: 6 }}>
              Nombre de la ruta
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Ej. Laguna Humantay"
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

          {/* Dificultad */}
          <View>
            <Text style={{ color: '#6B8F71', fontSize: 12, fontWeight: '500', marginBottom: 12 }}>
              Dificultad
            </Text>
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
                    borderColor: difficulty === d ? difficultyColors[d] : '#2D6A4F',
                  }}
                >
                  <Text style={{
                    color: difficulty === d ? difficultyColors[d] : '#6B8F71',
                    fontWeight: '600',
                    fontSize: 13,
                  }}>
                    {DifficultyLabel[d]}
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
              backgroundColor: name.trim() ? '#22C55E' : '#1A2E1F',
              borderRadius: 12,
              paddingVertical: 16,
              alignItems: 'center',
              marginTop: 16,
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 10,
            }}
          >
            {checkingGps ? (
              <ActivityIndicator color="#0D1B12" />
            ) : (
              <>
                <Ionicons name="play-circle" size={22} color={name.trim() ? '#0D1B12' : '#6B8F71'} />
                <Text style={{
                  color: name.trim() ? '#0D1B12' : '#6B8F71',
                  fontSize: 16,
                  fontWeight: '700',
                }}>
                  Iniciar grabación
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
