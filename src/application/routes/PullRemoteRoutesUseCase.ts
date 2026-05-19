import { pullRemoteRoutes, PullResult } from '@infrastructure/services/SyncServiceImpl';

export async function pullRemoteRoutesUseCase(userId: string): Promise<PullResult> {
  return pullRemoteRoutes(userId);
}
