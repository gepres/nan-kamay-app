import { Difficulty } from '../value-objects/Difficulty';

export interface RouteProps {
  id: string;
  userId: string;
  name: string;
  description?: string;
  activityType?: string;
  difficulty: Difficulty;
  distanceMeters: number;
  durationSeconds: number;
  elevationGainMeters: number;
  elevationLossMeters: number;
  maxElevationMeters: number;
  avgSpeedKmh: number;
  maxSpeedKmh: number;
  startedAt: Date;
  finishedAt?: Date;
  isPublic: boolean;
  isSynced: boolean;
  createdAt: Date;
}

export class Route {
  private constructor(private readonly props: RouteProps) {}

  static create(props: Omit<RouteProps, 'id' | 'createdAt' | 'isSynced'>): Route {
    return new Route({
      ...props,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      isSynced: false,
      createdAt: new Date(),
    });
  }

  static fromProps(props: RouteProps): Route {
    return new Route(props);
  }

  get id() { return this.props.id; }
  get userId() { return this.props.userId; }
  get name() { return this.props.name; }
  get description() { return this.props.description; }
  get activityType() { return this.props.activityType; }
  get difficulty() { return this.props.difficulty; }
  get distanceMeters() { return this.props.distanceMeters; }
  get durationSeconds() { return this.props.durationSeconds; }
  get elevationGainMeters() { return this.props.elevationGainMeters; }
  get elevationLossMeters() { return this.props.elevationLossMeters; }
  get maxElevationMeters() { return this.props.maxElevationMeters; }
  get avgSpeedKmh() { return this.props.avgSpeedKmh; }
  get maxSpeedKmh() { return this.props.maxSpeedKmh; }
  get startedAt() { return this.props.startedAt; }
  get finishedAt() { return this.props.finishedAt; }
  get isPublic() { return this.props.isPublic; }
  get isSynced() { return this.props.isSynced; }
  get createdAt() { return this.props.createdAt; }

  toProps(): RouteProps {
    return { ...this.props };
  }
}
