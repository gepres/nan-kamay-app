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

export default function WaypointScreen() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
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
      imageUris,
    });

    addWaypoint(waypoint);
    router.back();
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
          marginBottom: 28,
        }}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="close" size={24} color="#6B8F71" />
          </TouchableOpacity>
          <Text style={{ color: '#E8F5E9', fontSize: 18, fontWeight: '700', marginLeft: 16 }}>
            Añadir waypoint
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 20 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Título */}
          <View>
            <Text style={{ color: '#6B8F71', fontSize: 12, fontWeight: '500', marginBottom: 6 }}>
              Título *
            </Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Ej. Mirador del cóndor"
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

          {/* Descripción */}
          <View>
            <Text style={{ color: '#6B8F71', fontSize: 12, fontWeight: '500', marginBottom: 6 }}>
              Descripción (opcional)
            </Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Describe este punto..."
              placeholderTextColor="#6B8F71"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              style={{
                backgroundColor: '#152219',
                borderColor: '#2D6A4F',
                borderWidth: 1,
                borderRadius: 10,
                paddingHorizontal: 16,
                paddingVertical: 14,
                color: '#E8F5E9',
                fontSize: 16,
                minHeight: 90,
              }}
            />
          </View>

          {/* Imágenes */}
          <View>
            <Text style={{ color: '#6B8F71', fontSize: 12, fontWeight: '500', marginBottom: 12 }}>
              Fotos ({imageUris.length}/5)
            </Text>
            <TouchableOpacity
              onPress={handleAddImage}
              disabled={imageUris.length >= 5}
              style={{
                backgroundColor: '#152219',
                borderColor: '#2D6A4F',
                borderWidth: 1,
                borderRadius: 10,
                paddingVertical: 20,
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Ionicons name="camera-outline" size={28} color="#22C55E" />
              <Text style={{ color: '#22C55E', fontSize: 14, fontWeight: '500' }}>
                Añadir foto
              </Text>
            </TouchableOpacity>
          </View>

          {/* Guardar */}
          <TouchableOpacity
            onPress={handleSave}
            disabled={!title.trim()}
            style={{
              backgroundColor: title.trim() ? '#22C55E' : '#1A2E1F',
              borderRadius: 12,
              paddingVertical: 16,
              alignItems: 'center',
              marginTop: 8,
            }}
          >
            <Text style={{
              color: title.trim() ? '#0D1B12' : '#6B8F71',
              fontSize: 16,
              fontWeight: '700',
            }}>
              Guardar waypoint
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
