import { syncOfflineRoutes, SyncResult } from '@infrastructure/services/SyncServiceImpl';

export async function syncOfflineRoutesUseCase(userId: string): Promise<SyncResult> {
  return syncOfflineRoutes(userId);
}
