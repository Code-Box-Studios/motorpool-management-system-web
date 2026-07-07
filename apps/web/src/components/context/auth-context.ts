import { createContext } from 'react';
import type { AppUser } from '@/lib/types';

// Synthetic marker (replaces the Supabase Session) — route guards only read
// this for truthiness, never its shape.
export type AuthSession = { authenticated: true } | null;

export type AuthContextType = {
  user: AppUser | null;
  session: AuthSession; // truthy when authenticated (route guards read this)
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextType | undefined>(
  undefined
);
