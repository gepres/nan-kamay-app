import { uuidv4 } from '@shared/utils/uuid';

export interface GpsPointProps {
  id: string;
  routeId: string;
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number | null;
  speed: number | null;       // m/s
  recordedAt: Date;
  sequenceIndex: number;
}

export class GpsPoint {
  private constructor(private readonly props: GpsPointProps) {}

  static create(props: Omit<GpsPointProps, 'id'>): GpsPoint {
    return new GpsPoint({ ...props, id: uuidv4() });
  }

  static fromProps(props: GpsPointProps): GpsPoint {
    return new GpsPoint(props);
  }

  get id() { return this.props.id; }
  get routeId() { return this.props.routeId; }
  get latitude() { return this.props.latitude; }
  get longitude() { return this.props.longitude; }
  get altitude() { return this.props.altitude; }
  get accuracy() { return this.props.accuracy; }
  get speed() { return this.props.speed; }
  get recordedAt() { return this.props.recordedAt; }
  get sequenceIndex() { return this.props.sequenceIndex; }

  toProps(): GpsPointProps {
    return { ...this.props };
  }
}
