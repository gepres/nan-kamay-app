import { Route } from '@core/entities/Route';

/**
 * Capa de agregación de métricas personales — funciones PURAS sobre `Route[]`
 * (no tocan BD ni red). Backbone de las vistas de Progreso, Récords y Recap.
 * Excluye borradores (`isDraft`). Usa `startedAt` para agrupar por fecha.
 */

export type Period = 'week' | 'month' | 'year';

export interface PeriodSummary {
  distanceMeters: number;
  elevationGainMeters: number;
  movingSeconds: number;
  routeCount: number;
  /** % de distancia vs el periodo anterior (null si no hay base previa). */
  distanceTrendPct: number | null;
}

export interface RecordRef {
  value: number;
  routeId: string;
  name: string;
}

export interface PersonalRecords {
  totalRoutes: number;
  totalDistanceMeters: number;
  totalElevationGainMeters: number;
  totalMovingSeconds: number;
  longestDistance: RecordRef | null;
  maxElevationGain: RecordRef | null;
  maxAltitude: RecordRef | null;
  longestDuration: RecordRef | null;
  streakDays: number;
}

export interface ActivitySlice {
  type: string;
  count: number;
  distanceMeters: number;
  /** Fracción 0..1 del total de distancia. */
  fraction: number;
}

export interface SeriesBucket {
  label: string;
  distanceMeters: number;
  current: boolean;
}

export interface DayDot {
  label: string;
  active: boolean;
  today: boolean;
}

export interface YearRecap {
  year: number;
  distanceMeters: number;
  elevationGainMeters: number;
  movingSeconds: number;
  routeCount: number;
}

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DOW_ES = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

const real = (routes: Route[]): Route[] => routes.filter((r) => !r.isDraft);

const ymd = (d: Date): string => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** Medianoche local del inicio del periodo que contiene a `d`. */
function periodStart(d: Date, period: Period): Date {
  if (period === 'week') {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dow = (x.getDay() + 6) % 7; // lunes = 0
    x.setDate(x.getDate() - dow);
    return x;
  }
  if (period === 'month') return new Date(d.getFullYear(), d.getMonth(), 1);
  return new Date(d.getFullYear(), 0, 1);
}

function prevPeriodStart(start: Date, period: Period): Date {
  if (period === 'week') {
    const p = new Date(start);
    p.setDate(p.getDate() - 7);
    return p;
  }
  if (period === 'month') return new Date(start.getFullYear(), start.getMonth() - 1, 1);
  return new Date(start.getFullYear() - 1, 0, 1);
}

function bucketLabel(start: Date, period: Period): string {
  if (period === 'week') return `${start.getDate()}/${start.getMonth() + 1}`;
  if (period === 'month') return MONTHS_ES[start.getMonth()];
  return String(start.getFullYear());
}

interface Totals { distanceMeters: number; elevationGainMeters: number; movingSeconds: number; routeCount: number; }

function sumIn(routes: Route[], startMs: number, endMs: number): Totals {
  const t: Totals = { distanceMeters: 0, elevationGainMeters: 0, movingSeconds: 0, routeCount: 0 };
  for (const r of routes) {
    const s = r.startedAt.getTime();
    if (s >= startMs && s < endMs) {
      t.distanceMeters += r.distanceMeters;
      t.elevationGainMeters += r.elevationGainMeters;
      t.movingSeconds += r.durationSeconds;
      t.routeCount += 1;
    }
  }
  return t;
}

export function computePeriodSummary(routes: Route[], period: Period, now: Date = new Date()): PeriodSummary {
  const rs = real(routes);
  const start = periodStart(now, period);
  const cur = sumIn(rs, start.getTime(), now.getTime() + 1);
  const prevStart = prevPeriodStart(start, period);
  const prev = sumIn(rs, prevStart.getTime(), start.getTime());
  const distanceTrendPct = prev.distanceMeters > 0
    ? ((cur.distanceMeters - prev.distanceMeters) / prev.distanceMeters) * 100
    : null;
  return { ...cur, distanceTrendPct };
}

export function computeDistanceSeries(
  routes: Route[], period: Period, now: Date = new Date(), buckets = 6,
): SeriesBucket[] {
  const rs = real(routes);
  const starts: Date[] = [periodStart(now, period)];
  for (let i = 1; i < buckets; i++) starts.unshift(prevPeriodStart(starts[0], period));
  return starts.map((s, i) => {
    const endMs = i + 1 < starts.length ? starts[i + 1].getTime() : now.getTime() + 1;
    return {
      label: bucketLabel(s, period),
      distanceMeters: sumIn(rs, s.getTime(), endMs).distanceMeters,
      current: i === starts.length - 1,
    };
  });
}

export function computeActivityBreakdown(routes: Route[]): ActivitySlice[] {
  const rs = real(routes);
  const map = new Map<string, { count: number; distanceMeters: number }>();
  let total = 0;
  for (const r of rs) {
    const type = (r.activityType && r.activityType.trim()) || 'Senderismo';
    const e = map.get(type) ?? { count: 0, distanceMeters: 0 };
    e.count += 1;
    e.distanceMeters += r.distanceMeters;
    map.set(type, e);
    total += r.distanceMeters;
  }
  return [...map.entries()]
    .map(([type, e]) => ({ type, count: e.count, distanceMeters: e.distanceMeters, fraction: total > 0 ? e.distanceMeters / total : 0 }))
    .sort((a, b) => b.distanceMeters - a.distanceMeters);
}

export function computeStreakDays(routes: Route[], now: Date = new Date()): number {
  const set = new Set(real(routes).map((r) => ymd(r.startedAt)));
  if (set.size === 0) return 0;
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Si hoy aún no hay actividad, la racha vigente puede terminar ayer.
  if (!set.has(ymd(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!set.has(ymd(cursor))) return 0;
  }
  let streak = 0;
  while (set.has(ymd(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function computePersonalRecords(routes: Route[], now: Date = new Date()): PersonalRecords {
  const rs = real(routes);
  const totals = sumIn(rs, -Infinity, Infinity);
  const best = (sel: (r: Route) => number): RecordRef | null => {
    let top: RecordRef | null = null;
    for (const r of rs) {
      const v = sel(r);
      if (v > 0 && (!top || v > top.value)) top = { value: v, routeId: r.id, name: r.name };
    }
    return top;
  };
  return {
    totalRoutes: totals.routeCount,
    totalDistanceMeters: totals.distanceMeters,
    totalElevationGainMeters: totals.elevationGainMeters,
    totalMovingSeconds: totals.movingSeconds,
    longestDistance: best((r) => r.distanceMeters),
    maxElevationGain: best((r) => r.elevationGainMeters),
    maxAltitude: best((r) => r.maxElevationMeters),
    longestDuration: best((r) => r.durationSeconds),
    streakDays: computeStreakDays(rs, now),
  };
}

/** Últimos `days` días (más antiguo→hoy) con flag de actividad. Para "constancia". */
export function computeRecentDays(routes: Route[], days = 7, now: Date = new Date()): DayDot[] {
  const set = new Set(real(routes).map((r) => ymd(r.startedAt)));
  const todayKey = ymd(now);
  const out: DayDot[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = ymd(d);
    out.push({ label: DOW_ES[d.getDay()], active: set.has(key), today: key === todayKey });
  }
  return out;
}

export function computeYearRecap(routes: Route[], year: number): YearRecap {
  const rs = real(routes);
  const start = new Date(year, 0, 1).getTime();
  const end = new Date(year + 1, 0, 1).getTime();
  const t = sumIn(rs, start, end);
  return { year, distanceMeters: t.distanceMeters, elevationGainMeters: t.elevationGainMeters, movingSeconds: t.movingSeconds, routeCount: t.routeCount };
}
