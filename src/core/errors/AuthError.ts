import { DomainError } from './DomainError';

export class AuthError extends DomainError {
  constructor(message: string) {
    super(message, 'AUTH_ERROR');
    this.name = 'AuthError';
  }

  static invalidCredentials() {
    return new AuthError('Email o contraseña incorrectos.');
  }

  static sessionExpired() {
    return new AuthError('Tu sesión ha expirado. Por favor inicia sesión nuevamente.');
  }
}
