/**
 * Waypoint types organized by category.
 * Icons use Lucide icon names (from lucide-react-native).
 * Data extracted from Pencil design: trek-kamay.pen → Waypoint Type Selector.
 */

export interface WaypointTypeInfo {
  label: string;
  /** Lucide icon name */
  icon: string;
  /** Icon color override (default: #F59E0B) */
  iconColor?: string;
}

export interface WaypointCategory {
  title: string;
  items: WaypointTypeInfo[];
}

export const WAYPOINT_CATEGORIES: WaypointCategory[] = [
  {
    title: 'GEOGRAFÍA Y NATURALEZA',
    items: [
      { label: 'Intersección', icon: 'GitBranch' },
      { label: 'Cima', icon: 'Mountain' },
      { label: 'Paso de Montaña', icon: 'MountainSnow' },
      { label: 'Cueva', icon: 'Vault' },
      { label: 'Fuente', icon: 'Droplet' },
      { label: 'Río', icon: 'Waves' },
      { label: 'Lago', icon: 'CircleDot' },
      { label: 'Cascada', icon: 'Droplets' },
      { label: 'Aguas Termales', icon: 'Thermometer' },
      { label: 'Mirador', icon: 'Eye' },
      { label: 'Playa', icon: 'Umbrella' },
      { label: 'Flora', icon: 'Flower2' },
      { label: 'Fauna', icon: 'Rabbit' },
      { label: 'Árbol', icon: 'TreePine' },
      { label: 'Obs. de Aves', icon: 'Bird' },
      { label: 'Panorámica', icon: 'Scan' },
    ],
  },
  {
    title: 'CONSTRUCCIONES HUMANAS',
    items: [
      { label: 'Refugio Mnt.', icon: 'House' },
      { label: 'Refugio Libre', icon: 'Warehouse' },
      { label: 'Puente', icon: 'LandPlot' },
      { label: 'Puerta', icon: 'DoorOpen' },
      { label: 'Túnel', icon: 'Archive' },
      { label: 'Monumento', icon: 'Landmark' },
      { label: 'Castillo', icon: 'Castle' },
      { label: 'Ruinas', icon: 'Columns2' },
      { label: 'Yacimiento', icon: 'Shovel' },
      { label: 'Arqueológico', icon: 'Scroll' },
      { label: 'Sitio Religioso', icon: 'Church' },
      { label: 'Mina', icon: 'Pickaxe' },
      { label: 'Museo', icon: 'Building2' },
      { label: 'Patrimonio', icon: 'Globe' },
      { label: 'Inst. Deportiva', icon: 'Dumbbell' },
      { label: 'Amarre', icon: 'Anchor' },
      { label: 'Sin Salida', icon: 'CircleX' },
      { label: 'Fin Pavimento', icon: 'Route' },
      { label: 'Pago Requerido', icon: 'CreditCard' },
    ],
  },
  {
    title: 'CIUDAD Y URBANO',
    items: [
      { label: 'Plaza', icon: 'Square' },
      { label: 'Iglesia', icon: 'Church' },
      { label: 'Mirador Urbano', icon: 'Eye' },
      { label: 'Fuente Urbana', icon: 'Droplets' },
      { label: 'Escaleras', icon: 'ChevronsUp' },
      { label: 'Subida', icon: 'TrendingUp' },
      { label: 'Cruce', icon: 'GitFork' },
      { label: 'Glorieta', icon: 'RotateCw' },
      { label: 'Semáforo', icon: 'TrafficCone' },
      { label: 'Banco', icon: 'Armchair' },
      { label: 'Carretera', icon: 'Signpost' },
      { label: 'Cafetería', icon: 'Coffee' },
      { label: 'Mercado', icon: 'ShoppingBasket' },
      { label: 'Farmacia', icon: 'Pill' },
      { label: 'Hospital', icon: 'Bandage' },
      { label: 'Baños', icon: 'Bath' },
      { label: 'Evento Social', icon: 'PartyPopper' },
      { label: 'Puesto Calle', icon: 'Store' },
      { label: 'Restaurante', icon: 'UtensilsCrossed' },
    ],
  },
  {
    title: 'VIAJES',
    items: [
      { label: 'Aparcamiento', icon: 'Car' },
      { label: 'Camping', icon: 'Tent' },
      { label: 'Pernoctación', icon: 'Moon' },
      { label: 'Picnic', icon: 'Utensils' },
      { label: 'Parque', icon: 'Trees' },
      { label: 'Parada Bus', icon: 'Bus' },
      { label: 'Parada Tren', icon: 'TrainFront' },
      { label: 'Metro', icon: 'TrainTrack' },
      { label: 'Ferry', icon: 'Ship' },
    ],
  },
  {
    title: 'OTROS',
    items: [
      { label: 'Waypoint', icon: 'MapPin' },
      { label: 'Foto', icon: 'Camera' },
      { label: 'Riesgo', icon: 'TriangleAlert', iconColor: '#EF4444' },
      { label: 'Información', icon: 'Info' },
      { label: 'Avituallamiento', icon: 'Package' },
      { label: 'Geocache', icon: 'Compass' },
    ],
  },
];

/** Flat list of all waypoint types */
export const ALL_WAYPOINT_TYPES: WaypointTypeInfo[] = WAYPOINT_CATEGORIES.flatMap((c) => c.items);

/** Get icon info for a given label */
export function getWaypointTypeInfo(label: string): WaypointTypeInfo | undefined {
  return ALL_WAYPOINT_TYPES.find((t) => t.label === label);
}
