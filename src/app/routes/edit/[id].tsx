import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Route } from '@core/entities/Route';
import { Difficulty, DifficultyLabel } from '@core/value-objects/Difficulty';
import { routeRepository } from '@infrastructure/repositories/RouteRepositoryImpl';
import { editRouteMetaUseCase } from '@application/routes/EditRouteMetaUseCase';
import { useRoutesStore } from '@presentation/stores/routesStore';
import { useAuthStore } from '@presentation/stores/authStore';
import { useUiStore } from '@presentation/stores/uiStore';
import { colors } from '@presentation/theme/colors';

const DIFFICULTIES: Difficulty[] = ['easy', 'moderate', 'hard', 'very_hard', 'expert'];
const DIFF_COLORS: Record<Difficulty, string> = {
  easy: colors.easy, moderate: colors.medium, hard: colors.hard, very_hard: colors.veryHard, expert: colors.expert,
};
const DEFAULT_ACTIVITIES = ['Senderismo', 'Correr', 'Maratón', 'Ciclismo', 'Escalada'];

export default function EditRouteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const { fetchRoutes } = useRoutesStore();
  const { showToast } = useUiStore();

  const [route, setRoute] = useState<Route | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('moderate');
  const [activity, setActivity] = useState('');

  useEffect(() => {
    if (!id) return;
    routeRepository.getById(id).then((r) => {
      setRoute(r);
      if (r) {
        setName(r.name);
        setDescription(r.description ?? '');
        setDifficulty(r.difficulty);
        setActivity(r.activityType ?? '');
      }
    }).finally(() => setLoading(false));
  }, [id]);

  // Chips de actividad: defaults + la actual si es personalizada.
  const activityChips = useMemo(() => {
    const set = [...DEFAULT_ACTIVITIES];
    if (activity && !set.includes(activity)) set.unshift(activity);
    return set;
  }, [activity]);

  const handleSave = async () => {
    if (!id || saving) return;
    if (!name.trim()) {
      showToast('El nombre no puede estar vacío.', 'error');
      return;
    }
    setSaving(true);
    try {
      await editRouteMetaUseCase(id, {
        name,
        description,
        difficulty,
        activityType: activity,
      });
      if (user) fetchRoutes(user.id);
      showToast('Cambios guardados.', 'success');
      router.back();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo guardar.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={colors.accent} size="large" />
      </SafeAreaView>
    );
  }

  if (!route) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: colors.textMuted }}>Ruta no encontrada.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, gap: 12,
      }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '700', flex: 1 }}>
          Editar ruta
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, paddingTop: 8 }}>
        {/* Nombre */}
        <Text style={styles_label}>Nombre</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Nombre de la ruta"
          placeholderTextColor={colors.textMuted}
          style={styles_input}
          maxLength={80}
        />

        {/* Descripción */}
        <Text style={[styles_label, { marginTop: 18 }]}>Descripción</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Notas, recomendaciones, puntos de interés…"
          placeholderTextColor={colors.textMuted}
          multiline
          style={[styles_input, { minHeight: 92, textAlignVertical: 'top', paddingTop: 12 }]}
          maxLength={500}
        />

        {/* Dificultad */}
        <Text style={[styles_label, { marginTop: 18 }]}>Dificultad</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {DIFFICULTIES.map((d) => {
            const sel = difficulty === d;
            const c = DIFF_COLORS[d];
            return (
              <TouchableOpacity
                key={d}
                onPress={() => setDifficulty(d)}
                style={{
                  paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10,
                  backgroundColor: sel ? c + '20' : colors.bgCard,
                  borderWidth: 1, borderColor: sel ? c + '90' : colors.border,
                }}
              >
                <Text style={{ color: sel ? c : colors.textSecondary, fontWeight: '700', fontSize: 13 }}>
                  {DifficultyLabel[d]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Actividad */}
        <Text style={[styles_label, { marginTop: 18 }]}>Actividad</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {activityChips.map((a) => {
            const sel = activity === a;
            return (
              <TouchableOpacity
                key={a}
                onPress={() => setActivity(a)}
                style={{
                  paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10,
                  backgroundColor: sel ? colors.accent : 'transparent',
                  borderWidth: 1, borderColor: sel ? colors.accent : colors.border,
                }}
              >
                <Text style={{ color: sel ? colors.bgPrimary : colors.textSecondary, fontWeight: '600', fontSize: 13 }}>
                  {a}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <TextInput
          value={activity}
          onChangeText={setActivity}
          placeholder="O escribe una actividad personalizada"
          placeholderTextColor={colors.textMuted}
          style={styles_input}
          maxLength={40}
        />

        {/* Nota: stats/track no editables */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          marginTop: 18, backgroundColor: colors.bgCard, borderRadius: 10,
          padding: 12, borderWidth: 1, borderColor: colors.border,
        }}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
          <Text style={{ color: colors.textMuted, fontSize: 12, flex: 1 }}>
            Distancia, duración y elevación se calculan del recorrido y no se editan aquí.
          </Text>
        </View>

        {/* Guardar */}
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          style={{
            marginTop: 24,
            backgroundColor: colors.accent,
            borderRadius: 12,
            paddingVertical: 16,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          {saving ? (
            <ActivityIndicator color={colors.bgPrimary} />
          ) : (
            <>
              <Ionicons name="checkmark" size={20} color={colors.bgPrimary} />
              <Text style={{ color: colors.bgPrimary, fontSize: 16, fontWeight: '700' }}>
                Guardar cambios
              </Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles_label = {
  color: colors.textSecondary,
  fontSize: 13,
  fontWeight: '600' as const,
  marginBottom: 8,
};

const styles_input = {
  backgroundColor: colors.bgInput,
  borderRadius: 10,
  borderWidth: 1,
  borderColor: colors.border,
  paddingHorizontal: 14,
  paddingVertical: 12,
  color: colors.textPrimary,
  fontSize: 15,
};
