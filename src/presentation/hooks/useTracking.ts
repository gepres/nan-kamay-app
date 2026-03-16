import { useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useTrackingStore } from '@presentation/stores/trackingStore';
import { useUiStore } from '@presentation/stores/uiStore';
import { gpsService } from '@infrastructure/services/GpsServiceImpl';
import { GpsPoint } from '@core/entities/GpsPoint';
import { GpsUpdate } from '@core/ports/services/IGpsService';
import { GpsFilter } from '@infrastructure/services/GpsFilter';
import { formatDistance, formatDuration } from '@shared/utils/formatters';

/**
 * Hook principal para la grabación GPS.
 * Conecta el GpsServiceImpl → GpsFilter → trackingStore.
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
  const gpsFilterRef = useRef(new GpsFilter());

  // Callback que recibe cada update de GPS
  const handleGpsUpdate = useCallback(
    (update: GpsUpdate) => {
      if (!routeId) return;

      // Siempre actualizar posición visible en el mapa (sin filtrar)
      updatePosition(update.coordinates);

      // Solo grabar puntos cuando está en estado "recording"
      const currentStatus = useTrackingStore.getState().status;
      if (currentStatus !== 'recording') return;

      // ── Pipeline de filtrado ──
      const filtered = gpsFilterRef.current.process(
        update.coordinates.latitude,
        update.coordinates.longitude,
        update.coordinates.altitude ?? null,
        update.accuracy,
        update.altitudeAccuracy,
        update.speed,
        update.timestamp,
      );

      // Punto descartado por el filtro (ruido, drift, teleport, baja precisión)
      if (!filtered) return;

      const point = GpsPoint.create({
        routeId,
        latitude: filtered.latitude,
        longitude: filtered.longitude,
        altitude: filtered.altitude,
        accuracy: filtered.accuracy,
        speed: filtered.speed,
        recordedAt: filtered.timestamp,
        sequenceIndex: sequenceRef.current++,
      });

      addGpsPoint(point);
    },
    [routeId, addGpsPoint, updatePosition]
  );

  // Iniciar/detener GPS según el estado
  useEffect(() => {
    if (status === 'recording') {
      gpsFilterRef.current.reset();
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

  // Resetear filtro y secuencia cuando cambia la ruta
  useEffect(() => {
    sequenceRef.current = 0;
    gpsFilterRef.current.reset();
  }, [routeId]);

  // Manejar cambios de AppState (foreground ↔ background)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
    });
    return () => subscription.remove();
  }, []);

  // Actualizar notificación persistente con stats cada 5 segundos
  const notifIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (status === 'recording' || status === 'paused') {
      // Iniciar intervalo de actualización de notificación
      notifIntervalRef.current = setInterval(() => {
        const state = useTrackingStore.getState();
        if (!state.startedAt) return;

        const now = Date.now();
        const elapsed = Math.floor((now - state.startedAt.getTime()) / 1000) - state.totalPausedSeconds;
        const dist = formatDistance(state.liveStats.distanceMeters);
        const dur = formatDuration(Math.max(0, elapsed));
        const statusText = state.status === 'paused' ? ' (Pausado)' : '';

        gpsService.updateTrackingNotification(
          `${dist} · ${dur}${statusText}`,
        ).catch(() => {});
      }, 5000);
    }

    return () => {
      if (notifIntervalRef.current) {
        clearInterval(notifIntervalRef.current);
        notifIntervalRef.current = null;
      }
    };
  }, [status]);

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
