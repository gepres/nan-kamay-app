import { uuidv4 } from '@shared/utils/uuid';

export type WaypointMediaType = 'image' | 'video' | 'audio';

/** Un elemento multimedia de un waypoint (foto, video corto o nota de voz). */
export interface WaypointMedia {
  type: WaypointMediaType;
  /** URI local (file://) o URL remota (https://) tras sincronizar. */
  uri: string;
  /** Duración en ms (video/audio). */
  durationMs?: number;
  /** Miniatura/poster (video): URI local o URL remota. */
  thumbnailUri?: string;
}

export interface WaypointProps {
  id: string;
  routeId: string;
  latitude: number;
  longitude: number;
  altitude: number | null;
  title: string;
  description?: string;
  type?: string;
  /** Media unificada (fotos, videos, notas de voz). Fuente de verdad. */
  media: WaypointMedia[];
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
  get media() { return this.props.media; }
  get createdAt() { return this.props.createdAt; }

  // ── Derivados por tipo (compatibilidad + conveniencia) ──
  /** Solo URIs de imágenes (compat con código existente: carrusel, replay). */
  get imageUris(): string[] {
    return this.props.media.filter((m) => m.type === 'image').map((m) => m.uri);
  }
  get videos(): WaypointMedia[] {
    return this.props.media.filter((m) => m.type === 'video');
  }
  get audios(): WaypointMedia[] {
    return this.props.media.filter((m) => m.type === 'audio');
  }

  toProps(): WaypointProps {
    return { ...this.props };
  }
}
