import { useState, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActionSheetIOS,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import WaypointIcon from '@presentation/components/ui/WaypointIcon';
import { useTrackingStore } from '@presentation/stores/trackingStore';
import { Waypoint } from '@core/entities/Waypoint';
import { getWaypointTypeInfo, type WaypointTypeInfo } from '@shared/constants/waypointTypes';
import { consumePendingWaypointType } from '@shared/utils/waypointSelection';
import { colors } from '@presentation/theme/colors';

const DEFAULT_ICON_COLOR = '#F59E0B';

export default function WaypointScreen() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [waypointType, setWaypointType] = useState('Mirador');
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [recentTypes, setRecentTypes] = useState<WaypointTypeInfo[]>([]);
  const { addWaypoint, routeId, currentPosition } = useTrackingStore();

  // Check for pending type selection when screen regains focus (returning from selector)
  useFocusEffect(
    useCallback(() => {
      const pending = consumePendingWaypointType();
      if (pending) {
        setWaypointType(pending);
        addToRecents(pending);
      }
    }, [])
  );

  const addToRecents = (label: string) => {
    setRecentTypes((prev) => {
      const info = getWaypointTypeInfo(label);
      if (!info) return prev;
      const filtered = prev.filter((t) => t.label !== label);
      return [info, ...filtered].slice(0, 5);
    });
  };

  const handleSelectType = (label: string) => {
    setWaypointType(label);
    addToRecents(label);
  };

  const pickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: 5 - imageUris.length,
    });
    if (!result.canceled) {
      const uris = result.assets.map((a) => a.uri);
      setImageUris((prev) => [...prev, ...uris].slice(0, 5));
    }
  };

  const pickFromCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Activa el acceso a la cámara en Configuración.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUris((prev) => [...prev, result.assets[0].uri].slice(0, 5));
    }
  };

  const handleAddImage = () => {
    if (imageUris.length >= 5) return;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancelar', 'Tomar foto', 'Elegir de galería'], cancelButtonIndex: 0 },
        (index) => {
          if (index === 1) pickFromCamera();
          if (index === 2) pickFromGallery();
        }
      );
    } else {
      Alert.alert('Agregar foto', '', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Tomar foto', onPress: pickFromCamera },
        { text: 'Elegir de galería', onPress: pickFromGallery },
      ]);
    }
  };

  const handleRemoveImage = (index: number) => {
    setImageUris((prev) => prev.filter((_, i) => i !== index));
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

  const handleViewAllTypes = () => {
    router.push({
      pathname: '/tracking/waypoint-types',
      params: {
        current: waypointType,
        recents: JSON.stringify(recentTypes),
      },
    });
  };

  const lat = currentPosition?.latitude;
  const lon = currentPosition?.longitude;
  const alt = currentPosition?.altitude;

  // Current type info for the chip display
  const currentTypeInfo = getWaypointTypeInfo(waypointType);

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

          {/* Tipo de Punto — label row with "Ver todos" + recent chips */}
          <View>
            <View style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 10,
            }}>
              <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '500' }}>
                Tipo de Punto
              </Text>
              <TouchableOpacity
                onPress={handleViewAllTypes}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
              >
                <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '600' }}>
                  Ver todos
                </Text>
                <Ionicons name="chevron-forward" size={14} color={colors.accent} />
              </TouchableOpacity>
            </View>

            {/* Chips: show current selected + recents */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {/* Always show the current selected type as active chip */}
              {currentTypeInfo && (
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingVertical: 10,
                  paddingHorizontal: 18,
                  borderRadius: 10,
                  backgroundColor: colors.accent,
                }}>
                  <Text style={{ color: colors.bgPrimary, fontWeight: '600', fontSize: 13 }}>
                    {currentTypeInfo.label}
                  </Text>
                </View>
              )}

              {/* Show recent types (excluding the currently selected one) */}
              {recentTypes
                .filter((t) => t.label !== waypointType)
                .map(({ label, icon, iconColor }) => (
                  <TouchableOpacity
                    key={label}
                    onPress={() => handleSelectType(label)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingVertical: 8,
                      paddingHorizontal: 14,
                      borderRadius: 20,
                      backgroundColor: colors.bgCard,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <WaypointIcon name={icon} size={14} color={iconColor || DEFAULT_ICON_COLOR} />
                    <Text style={{ color: colors.textPrimary, fontSize: 13 }}>{label}</Text>
                  </TouchableOpacity>
                ))}
            </View>
          </View>

          {/* Foto */}
          <View>
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '500', marginBottom: 10 }}>
              Foto
            </Text>

            {/* Previsualizaciones */}
            {imageUris.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginBottom: 12 }}
                contentContainerStyle={{ gap: 10 }}
              >
                {imageUris.map((uri, index) => (
                  <View key={index} style={{ position: 'relative' }}>
                    <Image
                      source={{ uri }}
                      style={{
                        width: 100,
                        height: 100,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: colors.border,
                      }}
                    />
                    {/* Botón eliminar */}
                    <TouchableOpacity
                      onPress={() => handleRemoveImage(index)}
                      style={{
                        position: 'absolute',
                        top: -8,
                        right: -8,
                        backgroundColor: colors.danger,
                        borderRadius: 12,
                        width: 24,
                        height: 24,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons name="close" size={14} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}

            {/* Botón agregar foto — vertical, solid border (matches Pencil) */}
            {imageUris.length < 5 && (
              <TouchableOpacity
                onPress={handleAddImage}
                style={{
                  backgroundColor: colors.bgInput,
                  borderColor: colors.border,
                  borderWidth: 1.5,
                  borderRadius: 12,
                  height: 120,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <Ionicons name="camera-outline" size={28} color={colors.textMuted} />
                <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '500' }}>
                  Toca para subir foto
                </Text>
              </TouchableOpacity>
            )}
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
