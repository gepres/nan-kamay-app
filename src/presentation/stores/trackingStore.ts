import { create } from 'zustand';
import { GpsPoint } from '@core/entities/GpsPoint';
import { Waypoint } from '@core/entities/Waypoint';
import { Coordinates } from '@core/value-objects/Coordinates';
import { Difficulty } from '@core/value-objects/Difficulty';
import { StatsCalculator, RouteStats, StatsAccumulator } from '@core/rules/StatsCalculator';
import { uuidv4 } from '@shared/utils/uuid';

export type TrackingStatus = 'idle' | 'recording' | 'paused' | 'finished';

export interface RouteGuide {
  /** ID de la ruta-padre que se está siguiendo (se persiste con la grabación). */
  parentRouteId: string;
  /** Nombre de la ruta padre (informativo). */
  parentName: string;
  /** Trazado guía (coords [lon,lat] del padre, ya proyectadas). */
  guidePoints: { latitude: number; longitude: number }[];
  /** Waypoints del padre (informativos sobre el mapa). */
  guideWaypoints: { latitude: number; longitude: number; title: string }[];
}

interface TrackingState {
  status: TrackingStatus;
  routeId: string | null;
  routeName: string;
  routeDescription: string;
  activityType: string;
  difficulty: Difficulty;
  gpsPoints: GpsPoint[];
  waypoints: Waypoint[];
  currentPosition: Coordinates | null;
  startedAt: Date | null;
  pausedAt: Date | null;
  totalPausedSeconds: number;
  liveStats: RouteStats;
  /** Auto-pausa: true cuando se detecta parada (congela el reloj, NO deja de grabar). */
  autoPaused: boolean;
  autoPausedAt: Date | null;
  /** Si se está siguiendo una ruta-padre, sus datos quedan aquí. */
  guide: RouteGuide | null;
  /** Acumulador incremental de stats (interno; evita recalcular O(n²)). */
  _statsAcc: StatsAccumulator;

  // Acciones
  startRecording: (
    name: string,
    difficulty: Difficulty,
    description?: string,
    activityType?: string,
    guide?: RouteGuide | null,
  ) => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  autoPause: () => void;
  autoResume: () => void;
  addGpsPoint: (point: GpsPoint) => void;
  addWaypoint: (waypoint: Waypoint) => void;
  updatePosition: (coords: Coordinates) => void;
  finishRecording: () => void;
  restoreSession: (payload: {
    routeId: string;
    routeName: string;
    routeDescription: string;
    activityType: string;
    difficulty: Difficulty;
    startedAt: Date;
    gpsPoints: GpsPoint[];
    waypoints: Waypoint[];
  }) => void;
  reset: () => void;
}

const initialStats: RouteStats = {
  distanceMeters: 0,
  durationSeconds: 0,
  elevationGainMeters: 0,
  elevationLossMeters: 0,
  maxElevationMeters: 0,
  minElevationMeters: 0,
  avgSpeedKmh: 0,
  maxSpeedKmh: 0,
};

/**
 * Segundos activos de grabación: tiempo total menos pausas (manuales) menos la
 * auto-pausa en curso. Fuente única para el reloj (store, notificación, UI).
 */
export function activeElapsedSeconds(
  s: { startedAt: Date | null; totalPausedSeconds: number; autoPaused: boolean; autoPausedAt: Date | null },
  nowMs: number = Date.now(),
): number {
  if (!s.startedAt) return 0;
  const raw = Math.floor((nowMs - s.startedAt.getTime()) / 1000);
  const ongoingAuto = s.autoPaused && s.autoPausedAt
    ? Math.floor((nowMs - s.autoPausedAt.getTime()) / 1000)
    : 0;
  return Math.max(0, raw - s.totalPausedSeconds - ongoingAuto);
}

export const useTrackingStore = create<TrackingState>((set, get) => ({
  status: 'idle',
  routeId: null,
  routeName: '',
  routeDescription: '',
  activityType: 'Senderismo',
  difficulty: 'easy',
  gpsPoints: [],
  waypoints: [],
  currentPosition: null,
  startedAt: null,
  pausedAt: null,
  totalPausedSeconds: 0,
  liveStats: initialStats,
  autoPaused: false,
  autoPausedAt: null,
  guide: null,
  _statsAcc: StatsCalculator.createAccumulator(),

  startRecording: (name, difficulty, description = '', activityType = 'Senderismo', guide = null) => {
    const routeId = uuidv4();
    set({
      status: 'recording',
      routeId,
      routeName: name,
      routeDescription: description,
      activityType,
      difficulty,
      gpsPoints: [],
      waypoints: [],
      startedAt: new Date(),
      pausedAt: null,
      totalPausedSeconds: 0,
      liveStats: initialStats,
      autoPaused: false,
      autoPausedAt: null,
      guide,
      _statsAcc: StatsCalculator.createAccumulator(),
    });
  },

  pauseRecording: () => {
    // Pausa manual: si había auto-pausa en curso, pliega su hueco al total y la
    // limpia (no se acumulan dos pausas).
    const { autoPaused, autoPausedAt, totalPausedSeconds } = get();
    const autoGap = autoPaused && autoPausedAt
      ? Math.floor((Date.now() - autoPausedAt.getTime()) / 1000)
      : 0;
    set({
      status: 'paused', pausedAt: new Date(),
      autoPaused: false, autoPausedAt: null,
      totalPausedSeconds: totalPausedSeconds + autoGap,
    });
  },

  autoPause: () => {
    const s = get();
    if (s.status === 'recording' && !s.autoPaused) {
      set({ autoPaused: true, autoPausedAt: new Date() });
    }
  },

  autoResume: () => {
    const s = get();
    if (s.autoPaused) {
      const gap = s.autoPausedAt ? Math.floor((Date.now() - s.autoPausedAt.getTime()) / 1000) : 0;
      set({ autoPaused: false, autoPausedAt: null, totalPausedSeconds: s.totalPausedSeconds + gap });
    }
  },

  resumeRecording: () => {
    const { pausedAt, totalPausedSeconds } = get();
    const additionalPaused = pausedAt
      ? Math.floor((Date.now() - pausedAt.getTime()) / 1000)
      : 0;
    set({
      status: 'recording',
      pausedAt: null,
      totalPausedSeconds: totalPausedSeconds + additionalPaused,
    });
  },

  addGpsPoint: (point) => {
    set((state) => {
      const gpsPoints = [...state.gpsPoints, point];
      const elapsed = activeElapsedSeconds(state);
      // O(1): acumulador incremental en vez de recalcular todo el array.
      StatsCalculator.accumulate(state._statsAcc, point);
      const liveStats = StatsCalculator.finalize(state._statsAcc, elapsed);
      return { gpsPoints, liveStats };
    });
  },

  addWaypoint: (waypoint) => {
    set((state) => ({ waypoints: [...state.waypoints, waypoint] }));
  },

  updatePosition: (coords) => {
    set({ currentPosition: coords });
  },

  finishRecording: () => {
    // Duración final = tiempo activo real (sin pausas manuales ni auto-pausa).
    const s = get();
    const elapsed = activeElapsedSeconds(s);
    const finalStats = StatsCalculator.calculate(s.gpsPoints, elapsed);
    set({ status: 'finished', liveStats: finalStats, autoPaused: false, autoPausedAt: null });
  },

  restoreSession: (p) => {
    // Recupera una grabación interrumpida desde SQLite. Queda en 'paused'
    // para que el usuario decida (reanudar o finalizar); el GPS no arranca
    // solo. La duración se reconstruye del span de puntos, y totalPausedSeconds
    // se ajusta para que finishRecording() no infle el tiempo con el hueco
    // que el proceso estuvo muerto.
    const now = Date.now();
    const lastPoint = p.gpsPoints[p.gpsPoints.length - 1];
    const lastAt = lastPoint ? lastPoint.recordedAt.getTime() : p.startedAt.getTime();
    const activeSeconds = Math.max(0, Math.floor((lastAt - p.startedAt.getTime()) / 1000));
    const gapSeconds = Math.max(0, Math.floor((now - lastAt) / 1000));

    set({
      status: 'paused',
      routeId: p.routeId,
      routeName: p.routeName,
      routeDescription: p.routeDescription,
      activityType: p.activityType,
      difficulty: p.difficulty,
      gpsPoints: p.gpsPoints,
      waypoints: p.waypoints,
      currentPosition: lastPoint
        ? { latitude: lastPoint.latitude, longitude: lastPoint.longitude, altitude: lastPoint.altitude ?? undefined }
        : null,
      startedAt: p.startedAt,
      pausedAt: new Date(now),
      totalPausedSeconds: gapSeconds,
      liveStats: StatsCalculator.calculate(p.gpsPoints, activeSeconds),
      autoPaused: false,
      autoPausedAt: null,
      _statsAcc: StatsCalculator.buildAccumulator(p.gpsPoints),
    });
  },

  reset: () => {
    set({
      status: 'idle',
      routeId: null,
      routeName: '',
      routeDescription: '',
      activityType: 'Senderismo',
      difficulty: 'easy',
      gpsPoints: [],
      waypoints: [],
      currentPosition: null,
      startedAt: null,
      pausedAt: null,
      totalPausedSeconds: 0,
      liveStats: initialStats,
      autoPaused: false,
      autoPausedAt: null,
      guide: null,
      _statsAcc: StatsCalculator.createAccumulator(),
    });
  },
}));
