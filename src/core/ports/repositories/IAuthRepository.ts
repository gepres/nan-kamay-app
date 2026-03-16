import { User } from '../../entities/User';

export interface IAuthRepository {
  loginWithEmail(email: string, password: string): Promise<User>;
  loginWithGoogle(): Promise<User>;
  register(email: string, password: string, fullName: string): Promise<User>;
  logout(): Promise<void>;
  getCurrentUser(): Promise<User | null>;
  onAuthStateChange(callback: (user: User | null) => void): () => void;
}
