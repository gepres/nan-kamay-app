import { create } from 'zustand';
import { GpsPoint } from '@core/entities/GpsPoint';
import { Waypoint } from '@core/entities/Waypoint';
import { Coordinates } from '@core/value-objects/Coordinates';
import { Difficulty } from '@core/value-objects/Difficulty';
import { StatsCalculator, RouteStats } from '@core/rules/StatsCalculator';

export type TrackingStatus = 'idle' | 'recording' | 'paused' | 'finished';

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

  // Acciones
  startRecording: (name: string, difficulty: Difficulty, description?: string, activityType?: string) => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  addGpsPoint: (point: GpsPoint) => void;
  addWaypoint: (waypoint: Waypoint) => void;
  updatePosition: (coords: Coordinates) => void;
  finishRecording: () => void;
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

  startRecording: (name, difficulty, description = '', activityType = 'Senderismo') => {
    const routeId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
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
        ? Math.floor((Date.now() - startedAt.getTime()) / 1000) - totalPausedSeconds
        : 0;
      const liveStats = StatsCalculator.calculate(gpsPoints, elapsed);
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

  reset: () => {
    set({
      status: 'idle',
      routeId: null,
      routeName: '',
      difficulty: 'easy',
      gpsPoints: [],
      waypoints: [],
      currentPosition: null,
      startedAt: null,
      pausedAt: null,
      totalPausedSeconds: 0,
      liveStats: initialStats,
    });
  },
}));
