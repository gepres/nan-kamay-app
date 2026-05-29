import React from 'react';
import {
  GitBranch, Mountain, MountainSnow, Droplet, Waves, CircleDot, Droplets,
  Thermometer, Eye, Umbrella, Flower2, Rabbit, TreePine, Bird, Scan,
  House, Warehouse, LandPlot, DoorOpen, Archive, Landmark, Castle, Columns2,
  Shovel, Scroll, Church, Pickaxe, Building2, Globe, Dumbbell, Anchor,
  CircleX, Route, CreditCard,
  Car, Tent, Moon, Utensils, Trees, Bus, TrainFront, TrainTrack, Ship,
  MapPin, Camera, TriangleAlert, Info, Package, Compass,
  Search, X, Vault,
  // CIUDAD Y URBANO
  Square, ChevronsUp, TrendingUp, GitFork, RotateCw, TrafficCone, Armchair,
  Signpost, Coffee, ShoppingBasket, Pill, Bandage, Bath, PartyPopper, Store,
  UtensilsCrossed, Footprints, Milestone, Building,
} from 'lucide-react-native';
import type { LucideProps } from 'lucide-react-native';

type IconComponent = React.ForwardRefExoticComponent<LucideProps & React.RefAttributes<any>>;

const ICON_MAP: Record<string, IconComponent> = {
  GitBranch, Mountain, MountainSnow, Droplet, Waves, CircleDot, Droplets,
  Thermometer, Eye, Umbrella, Flower2, Rabbit, TreePine, Bird, Scan,
  House, Warehouse, LandPlot, DoorOpen, Archive, Landmark, Castle, Columns2,
  Shovel, Scroll, Church, Pickaxe, Building2, Globe, Dumbbell, Anchor,
  CircleX, Route, CreditCard,
  Car, Tent, Moon, Utensils, Trees, Bus, TrainFront, TrainTrack, Ship,
  MapPin, Camera, TriangleAlert, Info, Package, Compass,
  Search, X, Vault,
  Square, ChevronsUp, TrendingUp, GitFork, RotateCw, TrafficCone, Armchair,
  Signpost, Coffee, ShoppingBasket, Pill, Bandage, Bath, PartyPopper, Store,
  UtensilsCrossed, Footprints, Milestone, Building,
};

interface Props {
  name: string;
  size?: number;
  color?: string;
}

export default function WaypointIcon({ name, size = 20, color = '#F59E0B' }: Props) {
  const IconComp = ICON_MAP[name];
  if (!IconComp) return null;
  return <IconComp size={size} color={color} />;
}
