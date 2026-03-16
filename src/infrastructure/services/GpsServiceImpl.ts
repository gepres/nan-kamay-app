import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { AppState, Platform } from 'react-native';
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
  private _backgroundStarted = false;

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
    _backgroundCallback = onUpdate;

    // Foreground: alta precisión, filtrado por distancia para evitar ruido GPS
    this.foregroundSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        distanceInterval: 10,      // 10m mínimo (5m estaba dentro del radio de ruido GPS)
        timeInterval: 5000,        // 5 segundos (a 5 km/h caminando ≈ 7m por intervalo)
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

    // Background: se activa cuando la app pasa a segundo plano o la pantalla se apaga.
    // Usa los mismos parámetros que foreground pero a través del TaskManager.
    await this.startBackgroundTracking();
  }

  private async startBackgroundTracking(): Promise<void> {
    try {
      // Android 12+: foreground service SOLO puede iniciarse con la app en primer plano
      if (Platform.OS === 'android' && AppState.currentState !== 'active') {
        console.log('[GPS] App no está en primer plano, background tracking se iniciará cuando vuelva');
        this.listenForForegroundToStartBackground();
        return;
      }

      const { status } = await Location.getBackgroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('[GPS] Permiso background no otorgado, solo foreground activo');
        return;
      }

      // Verificar si ya está corriendo para evitar duplicados
      const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      if (isRunning) {
        this._backgroundStarted = true;
        return;
      }

      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: Location.Accuracy.BestForNavigation,
        distanceInterval: 10,
        timeInterval: 5000,
        // Android: mostrar notificación persistente (requerido para background en Android 10+)
        foregroundService: {
          notificationTitle: 'Ñan Kamay — Grabando ruta',
          notificationBody: 'Tu ruta se está grabando en segundo plano',
          notificationColor: '#22C55E',
        },
        // iOS: indicador de ubicación en la barra de estado
        showsBackgroundLocationIndicator: true,
        // Seguir recibiendo updates aunque la app esté suspendida
        pausesUpdatesAutomatically: false,
        // Filtrar actualizaciones de baja calidad en background
        deferredUpdatesInterval: 5000,
        deferredUpdatesDistance: 10,
      });

      this._backgroundStarted = true;
      console.log('[GPS] Background tracking iniciado');
    } catch (err) {
      console.warn('[GPS] No se pudo iniciar background tracking:', err);
      // No lanzar error — foreground sigue funcionando
    }
  }

  /** Espera a que la app vuelva a primer plano para iniciar el background service */
  private listenForForegroundToStartBackground(): void {
    const subscription = AppState.addEventListener('change', async (state) => {
      if (state === 'active' && this._isTracking && !this._backgroundStarted) {
        subscription.remove();
        await this.startBackgroundTracking();
      }
    });
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

  async stopTracking(): Promise<void> {
    this._isTracking = false;
    _backgroundCallback = null;

    if (this.foregroundSubscription) {
      this.foregroundSubscription.remove();
      this.foregroundSubscription = null;
    }

    await this.stopBackgroundTracking();
  }

  isTracking(): boolean {
    return this._isTracking;
  }
}

// Singleton para toda la app
export const gpsService = new GpsServiceImpl();
