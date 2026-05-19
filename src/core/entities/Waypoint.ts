import { uuidv4 } from '@shared/utils/uuid';

export interface WaypointProps {
  id: string;
  routeId: string;
  latitude: number;
  longitude: number;
  altitude: number | null;
  title: string;
  description?: string;
  type?: string;
  imageUris: string[];  // URIs locales o URLs de Supabase Storage
  createdAt: Date;
}

export class Waypoint {
  private constructor(private readonly props: WaypointProps) {}

  static create(props: Omit<WaypointProps, 'id' | 'createdAt'>): Waypoint {
    return new Waypoint({
      ...props,
      id: uuidv4(),
      createdAt: new Date(),
    });
  }

  static fromProps(props: WaypointProps): Waypoint {
    return new Waypoint(props);
  }

  get id() { return this.props.id; }
  get routeId() { return this.props.routeId; }
  get latitude() { return this.props.latitude; }
  get longitude() { return this.props.longitude; }
  get altitude() { return this.props.altitude; }
  get title() { return this.props.title; }
  get description() { return this.props.description; }
  get type() { return this.props.type; }
  get imageUris() { return this.props.imageUris; }
  get createdAt() { return this.props.createdAt; }

  toProps(): WaypointProps {
    return { ...this.props };
  }
}
