import { routeRepository } from '@infrastructure/repositories/RouteRepositoryImpl';

export async function deleteRouteUseCase(routeId: string): Promise<void> {
  await routeRepository.delete(routeId);
}
