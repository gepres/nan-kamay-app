/**
 * Traduce los errores crudos de Supabase Auth (en inglés) a mensajes
 * claros en español para mostrar al usuario.
 */
export function authErrorMessage(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
  const msg = raw.toLowerCase();

  // Credenciales incorrectas (login)
  if (msg.includes('invalid login credentials')) {
    return 'Correo o contraseña incorrectos. Verifica tus datos, o regístrate si aún no tienes una cuenta.';
  }

  // Email sin confirmar
  if (msg.includes('email not confirmed')) {
    return 'Tu cuenta aún no está confirmada. Revisa tu correo para activarla.';
  }

  // Email ya registrado (registro)
  if (
    msg.includes('already registered') ||
    msg.includes('already been registered') ||
    msg.includes('user already exists')
  ) {
    return 'Este correo ya está registrado. Inicia sesión en su lugar.';
  }

  // Contraseña débil
  if (msg.includes('password') && (msg.includes('at least') || msg.includes('weak') || msg.includes('should be'))) {
    return 'La contraseña es demasiado débil. Usa al menos 8 caracteres.';
  }

  // Formato de email inválido
  if (msg.includes('invalid') && msg.includes('email')) {
    return 'El correo electrónico no tiene un formato válido.';
  }

  // Límite de intentos / rate limit
  if (msg.includes('rate limit') || msg.includes('for security purposes') || msg.includes('too many requests')) {
    return 'Demasiados intentos. Espera unos segundos e inténtalo de nuevo.';
  }

  // Fallo de red / sin conexión
  if (
    msg.includes('network request failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('network error') ||
    msg.includes('timeout')
  ) {
    return 'No se pudo conectar con el servidor. Revisa tu conexión a internet.';
  }

  // Genérico (nunca mostramos el texto crudo en inglés)
  return 'No se pudo completar la operación. Inténtalo de nuevo más tarde.';
}
