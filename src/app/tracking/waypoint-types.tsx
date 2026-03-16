import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import WaypointIcon from '@presentation/components/ui/WaypointIcon';
import { WAYPOINT_CATEGORIES, type WaypointTypeInfo } from '@shared/constants/waypointTypes';
import { setPendingWaypointType } from '@shared/utils/waypointSelection';
import { colors } from '@presentation/theme/colors';

const DEFAULT_ICON_COLOR = '#F59E0B';

export default function WaypointTypeSelectorScreen() {
  const { current, recents: recentsParam } = useLocalSearchParams<{ current?: string; recents?: string }>();
  const [search, setSearch] = useState('');

  const recentTypes: WaypointTypeInfo[] = recentsParam
    ? JSON.parse(recentsParam)
    : [];

  const handleSelect = (label: string) => {
    setPendingWaypointType(label);
    router.back();
  };

  const searchLower = search.toLowerCase();
  const filteredCategories = search
    ? WAYPOINT_CATEGORIES.map((cat) => ({
        ...cat,
        items: cat.items.filter((item) => item.label.toLowerCase().includes(searchLower)),
      })).filter((cat) => cat.items.length > 0)
    : WAYPOINT_CATEGORIES;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 16,
        marginBottom: 16,
      }}>
        <Text style={{ color: colors.textPrimary, fontSize: 22, fontWeight: '700' }}>
          Tipo de Punto
        </Text>
        <TouchableOpacity onPress={() => router.back()}>
          <WaypointIcon name="X" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginHorizontal: 20,
        marginBottom: 20,
        backgroundColor: colors.bgInput,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
      }}>
        <WaypointIcon name="Search" size={16} color={colors.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar tipo de punto..."
          placeholderTextColor={colors.textMuted}
          style={{ flex: 1, color: colors.textPrimary, fontSize: 14, padding: 0 }}
        />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Recientes */}
        {!search && recentTypes.length > 0 && (
          <View style={{ gap: 12 }}>
            <Text style={{
              color: colors.textMuted,
              fontSize: 11,
              fontWeight: '700',
              letterSpacing: 2,
            }}>
              RECIENTE
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {recentTypes.map(({ label, icon, iconColor }) => (
                <TouchableOpacity
                  key={label}
                  onPress={() => handleSelect(label)}
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
        )}

        {/* Categories */}
        {filteredCategories.map((category) => (
          <View key={category.title} style={{ gap: 12 }}>
            <Text style={{
              color: colors.textMuted,
              fontSize: 11,
              fontWeight: '700',
              letterSpacing: 2,
            }}>
              {category.title}
            </Text>
            <CategoryGrid
              items={category.items}
              currentType={current}
              onSelect={handleSelect}
            />
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function CategoryGrid({
  items,
  currentType,
  onSelect,
}: {
  items: WaypointTypeInfo[];
  currentType?: string;
  onSelect: (label: string) => void;
}) {
  // Build rows of 4
  const rows: WaypointTypeInfo[][] = [];
  for (let i = 0; i < items.length; i += 4) {
    rows.push(items.slice(i, i + 4));
  }

  return (
    <View style={{ gap: 16 }}>
      {rows.map((row, rowIdx) => (
        <View key={rowIdx} style={{ flexDirection: 'row' }}>
          {row.map((item) => {
            const isActive = currentType === item.label;
            return (
              <TouchableOpacity
                key={item.label}
                onPress={() => onSelect(item.label)}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  gap: 8,
                  paddingVertical: 12,
                }}
              >
                <View style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: isActive ? colors.accent : colors.bgCard,
                  borderWidth: 1,
                  borderColor: isActive ? colors.accent : colors.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <WaypointIcon
                    name={item.icon}
                    size={20}
                    color={isActive ? colors.bgPrimary : (item.iconColor || DEFAULT_ICON_COLOR)}
                  />
                </View>
                <Text style={{
                  color: isActive ? colors.textPrimary : colors.textSecondary,
                  fontSize: 11,
                  textAlign: 'center',
                  fontWeight: isActive ? '600' : 'normal',
                }}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
          {/* Fill empty spaces in last row */}
          {row.length < 4 && Array.from({ length: 4 - row.length }).map((_, i) => (
            <View key={`spacer-${i}`} style={{ flex: 1 }} />
          ))}
        </View>
      ))}
    </View>
  );
}
