import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
} from 'react-native';
import {
  Mountain, ImageIcon, Bike, Bus, Globe, Compass,
  Building2, Smartphone, Contrast, Satellite, CircleCheck, X,
} from 'lucide-react-native';
import type { LucideProps } from 'lucide-react-native';
import { MAP_LAYERS, type MapLayerInfo } from '@shared/constants/mapLayers';
import { colors } from '@presentation/theme/colors';

type IconComponent = React.ForwardRefExoticComponent<LucideProps & React.RefAttributes<any>>;

const ICON_MAP: Record<string, IconComponent> = {
  Mountain, Image: ImageIcon, Bike, Bus, Globe, Compass,
  Building2, Smartphone, Contrast, Satellite,
};

interface Props {
  visible: boolean;
  selectedLayer: string;
  onSelect: (layerKey: string) => void;
  onClose: () => void;
}

export default function LayerSelectorModal({ visible, selectedLayer, onSelect, onClose }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: '#00000099', justifyContent: 'flex-end' }}>
        {/* Tap backdrop to close */}
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={1}
          onPress={onClose}
        />

        {/* Bottom Sheet */}
        <View style={{
          backgroundColor: colors.bgPrimary,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          paddingTop: 12,
          paddingHorizontal: 20,
          paddingBottom: 24,
          gap: 16,
          maxHeight: '80%',
        }}>
          {/* Handle bar */}
          <View style={{ alignItems: 'center' }}>
            <View style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.border,
            }} />
          </View>

          {/* Header row */}
          <View style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <Text style={{
              color: colors.textPrimary,
              fontFamily: 'Sora',
              fontSize: 20,
              fontWeight: '700',
              letterSpacing: -0.5,
            }}>
              Tipo de Mapa
            </Text>
            <TouchableOpacity
              onPress={onClose}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: colors.bgCard,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Subtitle */}
          <Text style={{
            color: colors.textSecondary,
            fontSize: 13,
          }}>
            Selecciona el estilo de mapa para tu ruta
          </Text>

          {/* Layer list */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: 2 }}
          >
            {MAP_LAYERS.map((layer) => (
              <LayerRow
                key={layer.key}
                layer={layer}
                isSelected={selectedLayer === layer.key}
                onPress={() => onSelect(layer.key)}
              />
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function LayerRow({
  layer,
  isSelected,
  onPress,
}: {
  layer: MapLayerInfo;
  isSelected: boolean;
  onPress: () => void;
}) {
  const IconComp = ICON_MAP[layer.icon];

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 12,
        ...(isSelected
          ? {
              backgroundColor: colors.accentSoft,
              borderWidth: 1,
              borderColor: colors.accent,
            }
          : {}),
      }}
    >
      {/* Icon circle */}
      <View style={{
        width: 40,
        height: 40,
        borderRadius: 10,
        backgroundColor: colors.bgCard,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {IconComp && (
          <IconComp
            size={20}
            color={isSelected ? colors.accent : colors.textSecondary}
          />
        )}
      </View>

      {/* Text */}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{
          color: colors.textPrimary,
          fontSize: 14,
          fontWeight: '600',
        }}>
          {layer.name}
        </Text>
        <Text style={{
          color: colors.textSecondary,
          fontSize: 12,
        }}>
          {layer.description}
        </Text>
      </View>

      {/* Check */}
      {isSelected && (
        <CircleCheck size={20} color={colors.accent} />
      )}
    </TouchableOpacity>
  );
}
