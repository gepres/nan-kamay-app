/**
 * Design tokens from trek-kamay.pen (Pencil)
 * Source of truth — do not hardcode colors in components.
 */
export const colors = {
  /** Amber — color principal de acción (#F59E0B) */
  accent: '#F59E0B',
  /** Amber con transparencia para fondos activos */
  accentSoft: '#F59E0B30',

  /** Fondo principal de la app */
  bgPrimary: '#0D1B12',
  /** Fondo de tarjetas */
  bgCard: '#1B4332',
  /** Fondo elevado / hover */
  bgElevated: '#2D6A4F',
  /** Fondo de inputs */
  bgInput: '#14291D',

  /** Texto principal */
  textPrimary: '#FFFFFF',
  /** Texto secundario */
  textSecondary: '#A7C4B5',
  /** Texto apagado */
  textMuted: '#6B8F7B',

  /** Color de bordes */
  border: '#2D6A4F',

  /** Dificultad fácil */
  easy: '#22C55E',
  /** Dificultad media */
  medium: '#F59E0B',
  /** Dificultad difícil */
  hard: '#EF4444',

  /** Éxito */
  success: '#22C55E',
  /** Peligro / error */
  danger: '#EF4444',
} as const;
