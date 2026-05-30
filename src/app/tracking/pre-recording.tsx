import { useState, useEffect } from 'react';
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
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTrackingStore, RouteGuide } from '@presentation/stores/trackingStore';
import { useAuthStore } from '@presentation/stores/authStore';
import { useUiStore } from '@presentation/stores/uiStore';
import { Difficulty, DifficultyLabel } from '@core/value-objects/Difficulty';
import { gpsService } from '@infrastructure/services/GpsServiceImpl';
import { startDraftRoute } from '@application/tracking/DraftRouteUseCase';
import { loadRouteGuide } from '@application/tracking/FollowRouteUseCase';
import { colors } from '@presentation/theme/colors';

const DIFF_ROW_1: Difficulty[] = ['easy', 'moderate', 'hard'];
const DIFF_ROW_2: Difficulty[] = ['very_hard', 'expert'];

const difficultyColors: Record<Difficulty, string> = {
  easy: colors.easy,
  moderate: colors.medium,
  hard: colors.hard,
  very_hard: colors.veryHard,
  expert: colors.expert,
};

const DEFAULT_ACTIVITIES = ['Senderismo', 'Recorrido', 'Correr', 'Maratón', 'Ciclismo', 'Escalada'];

export default function PreRecordingScreen() {
  const { followFrom } = useLocalSearchParams<{ followFrom?: string }>();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [activityType, setActivityType] = useState('Senderismo');
  const [customActivities, setCustomActivities] = useState<string[]>([]);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customActivityName, setCustomActivityName] = useState('');
  const [checkingGps, setCheckingGps] = useState(false);
  const [guide, setGuide] = useState<RouteGuide | null>(null);
  const [loadingGuide, setLoadingGuide] = useState(false);
  const { startRecording } = useTrackingStore();
  const { user } = useAuthStore();
  const { showToast } = useUiStore();

  // Si llegamos con ?followFrom=X, cargar la ruta-padre como guía y prellenar
  // el nombre para que sea obvio que es una grabación derivada.
  useEffect(() => {
    if (!followFrom) return;
    setLoadingGuide(true);
    loadRouteGuide(followFrom)
      .then((g) => {
        if (!g) {
          showToast('No se pudo cargar la ruta a seguir', 'error');
          return;
        }
        setGuide(g);
        if (!name) setName(`Siguiendo: ${g.parentName}`);
      })
      .catch(() => showToast('Error al cargar la ruta a seguir', 'error'))
      .finally(() => setLoadingGuide(false));
  }, [followFrom]);

  const allActivities = [...DEFAULT_ACTIVITIES, ...customActivities];

  const handleAddCustomActivity = () => {
    const trimmed = customActivityName.trim();
    if (!trimmed) return;
    if (allActivities.includes(trimmed)) {
      setActivityType(trimmed);
      setShowCustomInput(false);
      setCustomActivityName('');
      return;
    }
    setCustomActivities((prev) => [...prev, trimmed]);
    setActivityType(trimmed);
    setShowCustomInput(false);
    setCustomActivityName('');
  };

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

    startRecording(name.trim(), difficulty, description.trim(), activityType, guide);

    // Crear el borrador en SQLite ANTES de navegar: a partir de aquí cada
    // punto se persiste incrementalmente y la ruta sobrevive a un kill.
    const st = useTrackingStore.getState();
    if (user && st.routeId && st.startedAt) {
      try {
        await startDraftRoute({
          routeId: st.routeId,
          userId: user.id,
          name: name.trim(),
          description: description.trim() || undefined,
          activityType,
          difficulty,
          startedAt: st.startedAt,
          parentRouteId: guide?.parentRouteId,
        });
      } catch (e) {
        console.error('[draft] no se pudo crear el borrador', e);
      }
    }

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

  const renderDiffChip = (d: Difficulty) => {
    const isActive = difficulty === d;
    return (
      <TouchableOpacity
        key={d}
        onPress={() => setDifficulty(d)}
        style={{
          paddingVertical: 10,
          paddingHorizontal: 18,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isActive ? colors.accent : 'transparent',
          borderWidth: 1,
          borderColor: isActive ? colors.accent : colors.border,
        }}
      >
        <Text style={{
          color: isActive ? colors.bgPrimary : colors.textSecondary,
          fontWeight: isActive ? '600' : '500',
          fontSize: 13,
        }}>
          {DifficultyLabel[d]}
        </Text>
      </TouchableOpacity>
    );
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
          {/* Banner "Siguiendo ruta" — solo si llegamos con ?followFrom */}
          {(loadingGuide || guide) && (
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              backgroundColor: '#60A5FA15',
              borderRadius: 12,
              padding: 14,
              borderWidth: 1,
              borderColor: '#60A5FA40',
            }}>
              {loadingGuide ? (
                <ActivityIndicator color="#60A5FA" />
              ) : (
                <Ionicons name="git-branch-outline" size={20} color="#60A5FA" />
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#60A5FA', fontSize: 12, fontWeight: '600' }}>
                  Siguiendo ruta
                </Text>
                <Text style={{ color: colors.textPrimary, fontSize: 14, marginTop: 2 }} numberOfLines={1}>
                  {guide ? guide.parentName : 'Cargando…'}
                </Text>
                {guide && (
                  <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                    {guide.guidePoints.length} puntos · {guide.guideWaypoints.length} waypoints de referencia
                  </Text>
                )}
              </View>
            </View>
          )}

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

          {/* Dificultad — 2 filas como en Pencil */}
          <View>
            <Text style={labelStyle}>Dificultad</Text>
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {DIFF_ROW_1.map(renderDiffChip)}
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {DIFF_ROW_2.map(renderDiffChip)}
              </View>
            </View>
          </View>

          {/* Tipo de Actividad — con opción "Nuevo Tipo" */}
          <View>
            <Text style={labelStyle}>Tipo de Actividad</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {allActivities.map((type) => (
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
                    color: activityType === type ? colors.bgPrimary : colors.textSecondary,
                    fontWeight: activityType === type ? '600' : '500',
                    fontSize: 13,
                  }}>
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}

              {/* Botón "Nuevo Tipo" */}
              <TouchableOpacity
                onPress={() => setShowCustomInput(true)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Ionicons name="add" size={14} color={colors.textMuted} />
                <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '500' }}>
                  Nuevo Tipo
                </Text>
              </TouchableOpacity>
            </View>

            {/* Input para actividad personalizada */}
            {showCustomInput && (
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <TextInput
                  value={customActivityName}
                  onChangeText={setCustomActivityName}
                  placeholder="Nombre de la actividad"
                  placeholderTextColor={colors.textMuted}
                  autoFocus
                  style={[inputStyle, { flex: 1 }]}
                  onSubmitEditing={handleAddCustomActivity}
                  returnKeyType="done"
                />
                <TouchableOpacity
                  onPress={handleAddCustomActivity}
                  disabled={!customActivityName.trim()}
                  style={{
                    backgroundColor: customActivityName.trim() ? colors.accent : colors.bgCard,
                    borderRadius: 10,
                    paddingHorizontal: 16,
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons
                    name="checkmark"
                    size={20}
                    color={customActivityName.trim() ? colors.bgPrimary : colors.textMuted}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setShowCustomInput(false); setCustomActivityName(''); }}
                  style={{
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="close" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            )}
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
