import { GpsPoint } from '@core/entities/GpsPoint';

export function rowToGpsPoint(row: Record<string, unknown>): GpsPoint {
  return GpsPoint.fromProps({
    id: row.id as string,
    routeId: row.route_id as string,
    latitude: row.latitude as number,
    longitude: row.longitude as number,
    altitude: (row.altitude as number | null) ?? null,
    accuracy: (row.accuracy as number | null) ?? null,
    speed: (row.speed as number | null) ?? null,
    recordedAt: new Date(row.recorded_at as string),
    sequenceIndex: row.sequence_index as number,
  });
}

export function gpsPointToRow(p: GpsPoint): Record<string, unknown> {
  const props = p.toProps();
  return {
    id: props.id,
    route_id: props.routeId,
    latitude: props.latitude,
    longitude: props.longitude,
    altitude: props.altitude ?? null,
    accuracy: props.accuracy ?? null,
    speed: props.speed ?? null,
    recorded_at: props.recordedAt.toISOString(),
    sequence_index: props.sequenceIndex,
  };
}

export function gpsPointToSupabase(p: GpsPoint): Record<string, unknown> {
  return gpsPointToRow(p); // mismo shape para Supabase
}
