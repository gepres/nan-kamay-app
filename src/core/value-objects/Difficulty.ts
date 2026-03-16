export type Difficulty = 'easy' | 'moderate' | 'hard' | 'very_hard' | 'expert';

export const DifficultyLabel: Record<Difficulty, string> = {
  easy: 'Fácil',
  moderate: 'Medio',
  hard: 'Difícil',
  very_hard: 'Muy Difícil',
  expert: 'Expertos',
};
