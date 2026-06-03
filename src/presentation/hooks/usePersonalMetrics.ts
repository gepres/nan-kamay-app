import { useMemo } from 'react';
import { useRoutesStore } from '@presentation/stores/routesStore';
import {
  computePersonalRecords,
  computePeriodSummary,
  computeDistanceSeries,
  computeActivityBreakdown,
  computeYearRecap,
  type Period,
} from '@application/metrics/computeMetrics';

/**
 * Métricas personales derivadas de las rutas locales (store). Memoizadas por
 * `routes` + `period`. Todo se calcula offline desde SQLite (vía el store).
 */
export function usePersonalMetrics(period: Period = 'month') {
  const routes = useRoutesStore((s) => s.routes);
  return useMemo(() => {
    const now = new Date();
    return {
      records: computePersonalRecords(routes, now),
      summary: computePeriodSummary(routes, period, now),
      series: computeDistanceSeries(routes, period, now),
      activity: computeActivityBreakdown(routes),
      recap: computeYearRecap(routes, now.getFullYear()),
    };
  }, [routes, period]);
}
