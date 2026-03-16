import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTrackingStore } from '@presentation/stores/trackingStore';
import { Waypoint } from '@core/entities/Waypoint';
import { colors } from '@presentation/theme/colors';

const WAYPOINT_TYPES = ['Mirador', 'Peligro', 'Campamento', 'Agua'];

export default function WaypointScreen() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [waypointType, setWaypointType] = useState('Mirador');
  const [imageUris, setImageUris] = useState<string[]>([]);
  const { addWaypoint, routeId, currentPosition } = useTrackingStore();

  const handleAddImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsMultipleSelection: false,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUris((prev) => [...prev, result.assets[0].uri]);
    }
  };

  const handleSave = () => {
    if (!title.trim() || !routeId) return;

    const waypoint = Waypoint.create({
      routeId,
      latitude: currentPosition?.latitude ?? 0,
      longitude: currentPosition?.longitude ?? 0,
      altitude: currentPosition?.altitude ?? null,
      title: title.trim(),
      description: description.trim() || undefined,
      type: waypointType,
      imageUris,
    });

    addWaypoint(waypoint);
    router.back();
  };

  const lat = currentPosition?.latitude;
  const lon = currentPosition?.longitude;
  const alt = currentPosition?.altitude;

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
          marginBottom: 16,
        }}>
          <Text style={{ color: colors.textPrimary, fontSize: 28, fontWeight: '700' }}>
            Agregar Punto
          </Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="close" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Ubicación actual */}
        {lat !== undefined && lon !== undefined && (
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginHorizontal: 20,
            marginBottom: 20,
            backgroundColor: colors.bgCard,
            borderRadius: 10,
            paddingHorizontal: 14,
            paddingVertical: 10,
          }}>
            <Ionicons name="location" size={16} color={colors.accent} />
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '500' }}>
              {lat.toFixed(4)}, {lon.toFixed(4)}
              {alt !== null && alt !== undefined ? ` · ${Math.round(alt)} m` : ''}
            </Text>
          </View>
        )}

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 20 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Título */}
          <View>
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '500', marginBottom: 6 }}>
              Título del Punto
            </Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="ej. Paso de Montaña"
              placeholderTextColor={colors.textMuted}
              style={inputStyle}
            />
          </View>

          {/* Descripción */}
          <View>
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '500', marginBottom: 6 }}>
              Descripción
            </Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="¿Qué encontraste aquí?"
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              style={[inputStyle, { minHeight: 80 }]}
            />
          </View>

          {/* Tipo de Punto */}
          <View>
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '500', marginBottom: 10 }}>
              Tipo de Punto
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {WAYPOINT_TYPES.map((type) => (
                <TouchableOpacity
                  key={type}
                  onPress={() => setWaypointType(type)}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 18,
                    borderRadius: 10,
                    backgroundColor: waypointType === type ? colors.accent : 'transparent',
                    borderWidth: 1,
                    borderColor: waypointType === type ? colors.accent : colors.border,
                  }}
                >
                  <Text style={{
                    color: waypointType === type ? colors.bgPrimary : colors.textMuted,
                    fontWeight: waypointType === type ? '600' : '500',
                    fontSize: 13,
                  }}>
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Foto */}
          <View>
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '500', marginBottom: 10 }}>
              Foto ({imageUris.length}/5)
            </Text>
            <TouchableOpacity
              onPress={handleAddImage}
              disabled={imageUris.length >= 5}
              style={{
                backgroundColor: colors.bgInput,
                borderColor: colors.border,
                borderWidth: 1.5,
                borderRadius: 12,
                paddingVertical: 30,
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Ionicons name="camera-outline" size={28} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '500' }}>
                Toca para subir foto
              </Text>
            </TouchableOpacity>
          </View>

          {/* Guardar */}
          <TouchableOpacity
            onPress={handleSave}
            disabled={!title.trim()}
            style={{
              backgroundColor: title.trim() ? colors.accent : colors.bgCard,
              borderRadius: 12,
              paddingVertical: 16,
              alignItems: 'center',
              marginTop: 8,
            }}
          >
            <Text style={{
              color: title.trim() ? colors.bgPrimary : colors.textMuted,
              fontSize: 16,
              fontWeight: '700',
            }}>
              Guardar Punto
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
