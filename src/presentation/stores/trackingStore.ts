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
      guide,
      _statsAcc: StatsCalculator.createAccumulator(),
    });
  },

  pauseRecording: () => {
    set({ status: 'paused', pausedAt: new Date() });
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
      const { startedAt, totalPausedSeconds } = state;
      const elapsed = startedAt
        ? Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000) - totalPausedSeconds)
        : 0;
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
    // Calcular el durationSeconds final (tiempo activo real, sin pausas)
    const { startedAt, totalPausedSeconds, gpsPoints } = get();
    const elapsed = startedAt
      ? Math.floor((Date.now() - startedAt.getTime()) / 1000) - totalPausedSeconds
      : 0;
    const finalStats = StatsCalculator.calculate(gpsPoints, Math.max(0, elapsed));
    set({ status: 'finished', liveStats: finalStats });
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
      guide: null,
      _statsAcc: StatsCalculator.createAccumulator(),
    });
  },
}));
