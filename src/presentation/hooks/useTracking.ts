import { useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useTrackingStore, activeElapsedSeconds } from '@presentation/stores/trackingStore';
import { useUiStore } from '@presentation/stores/uiStore';
import { gpsService } from '@infrastructure/services/GpsServiceImpl';
import { GpsPoint } from '@core/entities/GpsPoint';
import { GpsUpdate } from '@core/ports/services/IGpsService';
import { GpsFilter } from '@infrastructure/services/GpsFilter';
import { appendDraftGpsPoint } from '@application/tracking/DraftRouteUseCase';
import { pushLivePosition, endLiveShare } from '@application/live/liveShareUseCases';
import { useLiveShareStore } from '@presentation/stores/liveShareStore';
import { formatDistance, formatDuration } from '@shared/utils/formatters';

/** Cadencia mínima entre subidas de posición en vivo (ms). */
const LIVE_PUSH_INTERVAL_MS = 10000;

/** Segundos sin punto aceptado (filtro estacionario lo corta todo) → auto-pausa. */
const AUTO_PAUSE_SEC = 30;

/** Anuncio de voz (expo-speech cargado de forma diferida: si el build no lo
 *  incluye, no rompe — simplemente no habla). */
function speakCue(text: string): void {
  try {
    const Speech = require('expo-speech');
    Speech.stop?.();
    Speech.speak(text, { language: 'es-ES' });
  } catch {
    /* expo-speech ausente en este build */
  }
}

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
  // Auto-pausa: marca de tiempo del último punto ACEPTADO por el filtro.
  const lastAcceptedAtRef = useRef(Date.now());
  // Último km ya anunciado por audio (evita repetir).
  const lastAnnouncedKmRef = useRef(0);
  // Marca de tiempo de la última subida de posición en vivo (throttle).
  const lastLivePushRef = useRef(0);

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

      // Un punto aceptado = movimiento real → reanudar si estábamos auto-pausados.
      lastAcceptedAtRef.current = Date.now();
      const st = useTrackingStore.getState();
      if (st.autoPaused) st.autoResume();

      // Anuncio de audio al cruzar cada km (si el usuario lo activó).
      if (useUiStore.getState().audioCues) {
        const km = Math.floor(st.liveStats.distanceMeters / 1000);
        if (km > lastAnnouncedKmRef.current) {
          lastAnnouncedKmRef.current = km;
          speakCue(`${km} kilómetro${km > 1 ? 's' : ''}. Tiempo ${formatDuration(st.liveStats.durationSeconds)}.`);
        }
      }
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
      // Cerrar el seguimiento en vivo si quedó activo (PR2): el visor verá "finalizó".
      const live = useLiveShareStore.getState();
      if (live.active && live.session) {
        endLiveShare(live.session.id).catch(() => {});
        live.clear();
      }
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
    const st0 = useTrackingStore.getState();
    const pts = st0.gpsPoints;
    if (pts.length === 0) {
      sequenceRef.current = 0;
      // Si la pre-grabación dejó una posición calentada, sembrar el filtro con
      // ella: el primer punto se mide contra un fix bueno (no contra el primer
      // fix frío de la grabación) → arranque sin dispersión.
      const cp = st0.currentPosition;
      if (cp) {
        gpsFilterRef.current.seed(cp.latitude, cp.longitude, cp.altitude ?? null, new Date());
      } else {
        gpsFilterRef.current.reset();
      }
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
    lastAcceptedAtRef.current = Date.now();
    lastAnnouncedKmRef.current = Math.floor(useTrackingStore.getState().liveStats.distanceMeters / 1000);
  }, [routeId]);

  // Auto-pausa: si el filtro no acepta puntos por AUTO_PAUSE_SEC (parada real,
  // el filtro estacionario corta todo), congela el reloj. NO cambia el estado a
  // 'paused' → se siguen grabando puntos; al moverse, un punto aceptado reanuda.
  useEffect(() => {
    if (status !== 'recording') return;
    lastAcceptedAtRef.current = Date.now(); // arranque / reanudación
    const id = setInterval(() => {
      const st = useTrackingStore.getState();
      if (st.status === 'recording' && !st.autoPaused &&
          Date.now() - lastAcceptedAtRef.current > AUTO_PAUSE_SEC * 1000) {
        st.autoPause();
      }
    }, 5000);
    return () => clearInterval(id);
  }, [status]);

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

        const elapsed = activeElapsedSeconds(state);
        const dist = formatDistance(state.liveStats.distanceMeters);
        const dur = formatDuration(elapsed);
        const statusText = state.status === 'paused' ? ' (Pausado)' : state.autoPaused ? ' (Auto-pausa)' : '';

        gpsService.updateTrackingNotification(
          `${dist} · ${dur}${statusText}`,
        ).catch(() => {});

        // Seguimiento en vivo (PR2): subir la última posición cada ~10 s si está
        // activo. Falla en silencio si no hay datos y reintenta al siguiente tick.
        const live = useLiveShareStore.getState();
        if (live.active && live.session && state.currentPosition &&
            Date.now() - lastLivePushRef.current >= LIVE_PUSH_INTERVAL_MS) {
          lastLivePushRef.current = Date.now();
          pushLivePosition({
            sessionId: live.session.id,
            coords: state.currentPosition,
            distanceMeters: state.liveStats.distanceMeters,
          }).catch(() => {});
        }
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
