import { supabase } from '@infrastructure/supabase/supabaseClient';
import { Route } from '@core/entities/Route';
import { Difficulty } from '@core/value-objects/Difficulty';

export interface PublicRoute {
  id: string;
  userId: string;
  name: string;
  description?: string;
  difficulty: Difficulty;
  distanceMeters: number;
  durationSeconds: number;
  elevationGainMeters: number;
  elevationLossMeters: number;
  maxElevationMeters: number;
  avgSpeedKmh: number;
  maxSpeedKmh: number;
  startedAt: Date;
  isPublic: true;
  isSynced: true;
  createdAt: Date;
  /** Nombre del autor si está disponible */
  authorName?: string;
}

export async function getPublicRoutesUseCase(
  currentUserId: string,
  limit = 50,
): Promise<PublicRoute[]> {
  const { data, error } = await supabase
    .from('routes')
    .select('*')
    .eq('is_public', true)
    .neq('user_id', currentUserId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  if (!data) return [];

  return data.map((row) => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description ?? undefined,
    difficulty: (row.difficulty as Difficulty) ?? 'easy',
    distanceMeters: row.distance_meters ?? 0,
    durationSeconds: row.duration_seconds ?? 0,
    elevationGainMeters: row.elevation_gain_meters ?? 0,
    elevationLossMeters: row.elevation_loss_meters ?? 0,
    maxElevationMeters: row.max_elevation_meters ?? 0,
    avgSpeedKmh: row.avg_speed_kmh ?? 0,
    maxSpeedKmh: row.max_speed_kmh ?? 0,
    startedAt: new Date(row.started_at),
    isPublic: true,
    isSynced: true,
    createdAt: new Date(row.created_at),
  }));
}
