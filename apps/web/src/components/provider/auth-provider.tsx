import React, { useEffect, useState } from 'react';
import { getCurrentUser, signIn, signOut } from '@/lib/api/auth';
import { onAuthFailure, setAccessToken } from '@/lib/api/client';
import type { AppUser } from '@/lib/types';
import { AuthContext, type AuthContextType } from '../context/auth-context';
import { Loading } from '../ui/loader';

type AuthProviderProps = {
  children: React.ReactNode;
};

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // If a silent refresh fails mid-session, drop auth (guards route to /login).
    onAuthFailure(() => {
      setAccessToken(null);
      setUser(null);
    });
    getCurrentUser()
      .then((u) => setUser(u))
      .finally(() => setLoading(false));
  }, []);

  // login/logout live on the context (no side-effect-in-render hack). The login
  // form calls auth.login(...); the user menu calls auth.logout().
  const login: AuthContextType['login'] = async (email, password) => {
    setUser(await signIn(email, password)); // signIn also sets the in-memory token
  };
  const logout: AuthContextType['logout'] = async () => {
    await signOut();
    setUser(null);
  };

  const value: AuthContextType = {
    user,
    session: user ? { authenticated: true } : null,
    loading,
    login,
    logout
  };

  if (loading) {
    return <Loading />;
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
