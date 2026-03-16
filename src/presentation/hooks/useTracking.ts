import { useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useTrackingStore } from '@presentation/stores/trackingStore';
import { useUiStore } from '@presentation/stores/uiStore';
import { gpsService } from '@infrastructure/services/GpsServiceImpl';
import { GpsPoint } from '@core/entities/GpsPoint';
import { GpsUpdate } from '@core/ports/services/IGpsService';

/**
 * Hook principal para la grabación GPS.
 * Conecta el GpsServiceImpl con el trackingStore.
 */
export function useTracking() {
  const {
    status,
    routeId,
    addGpsPoint,
    updatePosition,
    gpsPoints,
  } = useTrackingStore();

  const { showToast } = useUiStore();
  const sequenceRef = useRef(gpsPoints.length);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Callback que recibe cada update de GPS
  const handleGpsUpdate = useCallback(
    (update: GpsUpdate) => {
      if (!routeId) return;

      // Actualizar posición visible en el mapa
      updatePosition(update.coordinates);

      // Solo grabar puntos cuando está en estado "recording"
      const currentStatus = useTrackingStore.getState().status;
      if (currentStatus !== 'recording') return;

      const point = GpsPoint.create({
        routeId,
        latitude: update.coordinates.latitude,
        longitude: update.coordinates.longitude,
        altitude: update.coordinates.altitude ?? null,
        accuracy: update.accuracy,
        speed: update.speed,
        recordedAt: update.timestamp,
        sequenceIndex: sequenceRef.current++,
      });

      addGpsPoint(point);
    },
    [routeId, addGpsPoint, updatePosition]
  );

  // Iniciar/detener GPS según el estado
  useEffect(() => {
    if (status === 'recording') {
      gpsService.startTracking(handleGpsUpdate).catch((err) => {
        showToast(err.message ?? 'Error al iniciar GPS', 'error');
      });
    } else if (status === 'finished' || status === 'idle') {
      gpsService.stopTracking().catch(console.error);
    }

    return () => {
      if (status === 'finished' || status === 'idle') {
        gpsService.stopTracking().catch(console.error);
      }
    };
  }, [status]);

  // Actualizar el callback cuando el routeId cambia
  useEffect(() => {
    sequenceRef.current = 0;
  }, [routeId]);

  // Manejar cambios de AppState (foreground ↔ background)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
    });
    return () => subscription.remove();
  }, []);

  /** Solicita permisos GPS. Retorna true si fueron concedidos. */
  const requestPermissions = useCallback(async (): Promise<boolean> => {
    const granted = await gpsService.requestPermissions();
    if (!granted) {
      showToast(
        'Permiso GPS denegado. Actívalo en Configuración → Privacidad.',
        'error'
      );
    }
    return granted;
  }, [showToast]);

  return { requestPermissions };
}
