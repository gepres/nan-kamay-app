import { Coordinates } from '../../value-objects/Coordinates';

export interface GpsUpdate {
  coordinates: Coordinates;
  speed: number | null;           // m/s
  accuracy: number | null;        // precisión horizontal en metros
  altitudeAccuracy: number | null; // precisión vertical en metros (null = no disponible)
  timestamp: Date;
}

export interface IGpsService {
  requestPermissions(): Promise<boolean>;
  startTracking(onUpdate: (update: GpsUpdate) => void): Promise<void>;
  stopTracking(): Promise<void>;
  getCurrentLocation(): Promise<Coordinates>;
  isTracking(): boolean;
}
