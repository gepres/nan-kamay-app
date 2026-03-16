import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { IGpsService, GpsUpdate } from '@core/ports/services/IGpsService';
import { Coordinates } from '@core/value-objects/Coordinates';
import { GpsError } from '@core/errors/GpsError';

export const BACKGROUND_LOCATION_TASK = 'background-location-task';

// Callback global para que el background task envíe updates al store
let _backgroundCallback: ((update: GpsUpdate) => void) | null = null;

/**
 * Define la tarea de ubicación en background.
 * DEBE estar al nivel de módulo (fora de funciones/clases).
 */
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }: TaskManager.TaskManagerTaskBody) => {
  if (error) {
    console.error('[GPS Background]', error.message);
    return;
  }
  if (data && _backgroundCallback) {
    const { locations } = data as { locations: Location.LocationObject[] };
    for (const loc of locations) {
      _backgroundCallback({
        coordinates: {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          altitude: loc.coords.altitude ?? undefined,
        },
        speed: loc.coords.speed,
        accuracy: loc.coords.accuracy,
        altitudeAccuracy: loc.coords.altitudeAccuracy ?? null,
        timestamp: new Date(loc.timestamp),
      });
    }
  }
});

export class GpsServiceImpl implements IGpsService {
  private foregroundSubscription: Location.LocationSubscription | null = null;
  private _isTracking = false;

  async requestPermissions(): Promise<boolean> {
    const { status: fg } = await Location.requestForegroundPermissionsAsync();
    if (fg !== 'granted') return false;

    // Solicitar background solo si el foreground fue aprobado
    const { status: bg } = await Location.requestBackgroundPermissionsAsync();
    return bg === 'granted' || fg === 'granted';
  }

  async getCurrentLocation(): Promise<Coordinates> {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') throw GpsError.permissionDenied();

    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      altitude: loc.coords.altitude ?? undefined,
    };
  }

  async startTracking(onUpdate: (update: GpsUpdate) => void): Promise<void> {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') throw GpsError.permissionDenied();

    this._isTracking = true;

    // Foreground: alta precisión mientras la pantalla está encendida
    this.foregroundSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        distanceInterval: 5,       // Cada 5 metros mínimo
        timeInterval: 3000,        // O cada 3 segundos
      },
      (loc) => {
        onUpdate({
          coordinates: {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            altitude: loc.coords.altitude ?? undefined,
          },
          speed: loc.coords.speed,
          accuracy: loc.coords.accuracy,
          altitudeAccuracy: loc.coords.altitudeAccuracy ?? null,
          timestamp: new Date(loc.timestamp),
        });
      }
    );

    // Background: menor precisión para ahorrar batería
    _backgroundCallback = onUpdate;
    try {
      const hasBackground = await Location.isBackgroundLocationAvailableAsync();
      if (hasBackground) {
        const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        if (!alreadyRunning) {
          await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 10,
            timeInterval: 5000,
            showsBackgroundLocationIndicator: true,
            foregroundService: {
              notificationTitle: 'Ñan Kamay',
              notificationBody: 'Grabando tu ruta...',
              notificationColor: '#22C55E',
            },
          });
        }
      }
    } catch (e) {
      // Background tracking no disponible (ej: permiso RECEIVE_BOOT_COMPLETED faltante).
      // El foreground tracking sigue activo.
      console.warn('[GPS] Background tracking no disponible:', e);
    }
  }

  async stopTracking(): Promise<void> {
    this._isTracking = false;
    _backgroundCallback = null;

    if (this.foregroundSubscription) {
      this.foregroundSubscription.remove();
      this.foregroundSubscription = null;
    }

    try {
      const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      if (isRunning) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      }
    } catch {
      // Task no encontrado o no iniciado — ignorar
    }
  }

  isTracking(): boolean {
    return this._isTracking;
  }
}

// Singleton para toda la app
export const gpsService = new GpsServiceImpl();
