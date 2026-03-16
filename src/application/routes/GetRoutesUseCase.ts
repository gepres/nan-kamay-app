import { Route } from '@core/entities/Route';
import { routeRepository } from '@infrastructure/repositories/RouteRepositoryImpl';

export async function getRoutesUseCase(userId: string): Promise<Route[]> {
  return routeRepository.getAll(userId);
}
