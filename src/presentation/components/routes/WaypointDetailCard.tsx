import { View, Text, Dimensions } from 'react-native';
import { Waypoint } from '@core/entities/Waypoint';
import WaypointIcon from '@presentation/components/ui/WaypointIcon';
import { getWaypointTypeInfo } from '@shared/constants/waypointTypes';
import WaypointPhotoCarousel from './WaypointPhotoCarousel';
import WaypointMediaSection from './WaypointMediaSection';
import { colors } from '@presentation/theme/colors';

const { width: SCREEN_W } = Dimensions.get('window');
// Ancho interno: pantalla − padding de página (20·2) − padding de tarjeta (14·2).
const CAROUSEL_W = SCREEN_W - 40 - 28;

/**
 * Tarjeta de waypoint para las vistas de detalle (privada y pública):
 * icono del tipo + título + tipo/altitud + descripción + carrusel de fotos
 * con descarga a galería. Reutilizable para mantener UX consistente.
 */
export default function WaypointDetailCard({ wp }: { wp: Waypoint }) {
  const info = wp.type ? getWaypointTypeInfo(wp.type) : undefined;
  const iconName = info?.icon ?? 'MapPin';
  const iconColor = info?.iconColor ?? colors.accent;

  return (
    <View style={{
      backgroundColor: colors.bgCard,
      borderRadius: 12,
      padding: 14,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: '#2D6A4F',
      gap: 12,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{
          width: 36, height: 36, borderRadius: 10,
          backgroundColor: iconColor + '20',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <WaypointIcon name={iconName} size={18} color={iconColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 15 }}>
            {wp.title}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
            {wp.type ? (
              <Text style={{ color: iconColor, fontSize: 12, fontWeight: '600' }}>{wp.type}</Text>
            ) : null}
            {wp.altitude != null && (
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>· {Math.round(wp.altitude)} m</Text>
            )}
          </View>
          {wp.description ? (
            <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 4, lineHeight: 18 }}>
              {wp.description}
            </Text>
          ) : null}
        </View>
      </View>

      {wp.imageUris.length > 0 && (
        <View style={{ borderRadius: 10, overflow: 'hidden' }}>
          <WaypointPhotoCarousel uris={wp.imageUris} width={CAROUSEL_W} height={180} />
        </View>
      )}

      <WaypointMediaSection media={wp.media} />
    </View>
  );
}
