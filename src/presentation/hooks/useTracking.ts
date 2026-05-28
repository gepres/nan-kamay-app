import { useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useTrackingStore } from '@presentation/stores/trackingStore';
import { useUiStore } from '@presentation/stores/uiStore';
import { gpsService } from '@infrastructure/services/GpsServiceImpl';
import { GpsPoint } from '@core/entities/GpsPoint';
import { GpsUpdate } from '@core/ports/services/IGpsService';
import { GpsFilter } from '@infrastructure/services/GpsFilter';
import { appendDraftGpsPoint } from '@application/tracking/DraftRouteUseCase';
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
  // `sequenceRef` debe ser SIEMPRE > el sequence_index más alto persistido en
  // la DB para esta ruta. Inicializarlo a 0 (o a gpsPoints.length) era el bug:
  // al restaurar un borrador con N puntos cuyo último seq podía ser N-1 (o más
  // si hubo gaps), reanudar emitía seq=0..k → colisiones con la DB y traza
  // intercalada al volver a recuperar.
  const sequenceRef = useRef(
    gpsPoints.length > 0
      ? Math.max(...gpsPoints.map((p) => p.sequenceIndex)) + 1
      : 0
  );
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

      // Persistir incrementalmente en SQLite (sobrevive a un kill del proceso)
      appendDraftGpsPoint(point).catch((e) =>
        console.error('[draft] no se pudo persistir punto', e)
      );
    },
    [routeId, addGpsPoint, updatePosition]
  );

  // Iniciar/detener GPS según el estado
  useEffect(() => {
    if (status === 'recording') {
      // No reseteamos el filtro aquí: el efecto [routeId] ya lo resetea al
      // iniciar una ruta nueva. Resetearlo en cada 'recording' rompía la
      // continuidad del Kalman al reanudar tras una pausa (M4).
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

  // Cuando cambia la ruta, sincronizar secuencia y filtro con el estado del
  // store. Hay dos casos:
  //   a) startRecording → gpsPoints está vacío → reset limpio, seq=0.
  //   b) restoreSession → gpsPoints tiene N puntos → seq=max+1 y semilla el
  //      filtro con el último punto para no perder/saltar al reanudar.
  useEffect(() => {
    const pts = useTrackingStore.getState().gpsPoints;
    if (pts.length === 0) {
      sequenceRef.current = 0;
      gpsFilterRef.current.reset();
    } else {
      sequenceRef.current = Math.max(...pts.map((p) => p.sequenceIndex)) + 1;
      const last = pts[pts.length - 1];
      gpsFilterRef.current.seed(
        last.latitude,
        last.longitude,
        last.altitude ?? null,
        last.recordedAt,
      );
    }
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
