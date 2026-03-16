import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { IGpsService, GpsUpdate } from '@core/ports/services/IGpsService';
import { Coordinates } from '@core/value-objects/Coordinates';
import { GpsError } from '@core/errors/GpsError';

export const BACKGROUND_LOCATION_TASK = 'background-location-task';
const TRACKING_NOTIFICATION_ID = 'tracking-active';

// Callback global para que el background task envíe updates al store
let _backgroundCallback: ((update: GpsUpdate) => void) | null = null;

/**
 * Define la tarea de ubicación en background.
 * DEBE estar al nivel de módulo (fuera de funciones/clases).
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

// Configurar canal de notificación para Android (silenciosa, persistente)
if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('tracking', {
    name: 'Grabación de ruta',
    importance: Notifications.AndroidImportance.LOW, // Sin sonido, solo visual
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    enableVibrate: false,
    enableLights: false,
  });
}

// No mostrar notificaciones como alerta cuando la app está en primer plano
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: false,
    shouldShowList: false,
  }),
});

export class GpsServiceImpl implements IGpsService {
  private foregroundSubscription: Location.LocationSubscription | null = null;
  private _isTracking = false;
  private _backgroundStarted = false;
  private notificationInterval: ReturnType<typeof setInterval> | null = null;

  async requestPermissions(): Promise<boolean> {
    const { status: fg } = await Location.requestForegroundPermissionsAsync();
    if (fg !== 'granted') return false;

    // Solicitar background solo si el foreground fue aprobado
    const { status: bg } = await Location.requestBackgroundPermissionsAsync();

    // Solicitar permiso de notificaciones (Android 13+)
    if (Platform.OS === 'android') {
      await Notifications.requestPermissionsAsync();
    }

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
    _backgroundCallback = onUpdate;

    // Foreground: alta precisión, filtrado por distancia para evitar ruido GPS
    this.foregroundSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        distanceInterval: 10,
        timeInterval: 5000,
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

    // Mostrar notificación persistente con stats
    await this.showTrackingNotification('Iniciando grabación...', '0 km · 00:00');

    // Background location via TaskManager (sin foregroundService propio, usamos expo-notifications)
    await this.startBackgroundTracking();
  }

  private async startBackgroundTracking(): Promise<void> {
    try {
      const { status } = await Location.getBackgroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('[GPS] Permiso background no otorgado, solo foreground activo');
        return;
      }

      const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      if (isRunning) {
        this._backgroundStarted = true;
        return;
      }

      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: Location.Accuracy.BestForNavigation,
        distanceInterval: 10,
        timeInterval: 5000,
        showsBackgroundLocationIndicator: true,
        pausesUpdatesAutomatically: false,
        deferredUpdatesInterval: 5000,
        deferredUpdatesDistance: 10,
        // Android: NO usamos foregroundService de expo-location (causa crash en Android 12+).
        // En su lugar, la notificación persistente de expo-notifications mantiene la app viva.
      });

      this._backgroundStarted = true;
      console.log('[GPS] Background tracking iniciado');
    } catch (err) {
      console.warn('[GPS] No se pudo iniciar background tracking:', err);
    }
  }

  private async stopBackgroundTracking(): Promise<void> {
    if (!this._backgroundStarted) return;
    try {
      const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      if (isRunning) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      }
    } catch (err) {
      console.warn('[GPS] Error al detener background tracking:', err);
    }
    this._backgroundStarted = false;
  }

  /**
   * Muestra/actualiza la notificación persistente de grabación.
   * En Android aparece en la barra de notificaciones con stats en vivo.
   */
  async showTrackingNotification(title: string, body: string): Promise<void> {
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: TRACKING_NOTIFICATION_ID,
        content: {
          title,
          body,
          sticky: true, // No se puede deslizar para quitar (Android)
          ...(Platform.OS === 'android' ? {
            categoryIdentifier: 'tracking',
            color: '#22C55E',
          } : {}),
        },
        trigger: null, // Inmediato
      });
    } catch (err) {
      console.warn('[GPS] Error mostrando notificación:', err);
    }
  }

  /** Actualiza el contenido de la notificación con stats actuales */
  async updateTrackingNotification(statsText: string): Promise<void> {
    await this.showTrackingNotification(
      'Ñan Kamay — Grabando ruta',
      statsText,
    );
  }

  /** Elimina la notificación persistente */
  private async dismissTrackingNotification(): Promise<void> {
    try {
      await Notifications.dismissNotificationAsync(TRACKING_NOTIFICATION_ID);
    } catch {
      // ignore
    }
  }

  async stopTracking(): Promise<void> {
    this._isTracking = false;
    _backgroundCallback = null;

    if (this.foregroundSubscription) {
      this.foregroundSubscription.remove();
      this.foregroundSubscription = null;
    }

    await this.stopBackgroundTracking();
    await this.dismissTrackingNotification();
  }

  isTracking(): boolean {
    return this._isTracking;
  }
}

// Singleton para toda la app
export const gpsService = new GpsServiceImpl();
