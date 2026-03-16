import { DomainError } from './DomainError';

export class GpsError extends DomainError {
  constructor(message: string) {
    super(message, 'GPS_ERROR');
    this.name = 'GpsError';
  }

  static permissionDenied() {
    return new GpsError('Permiso de ubicación denegado. Por favor habilítalo en configuración.');
  }

  static unavailable() {
    return new GpsError('Servicio de GPS no disponible en este dispositivo.');
  }
}
