import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Session, User } from '@supabase/supabase-js';
import { AuthContext, type AuthContextType } from '../context/auth-context';
import { Loading } from '../ui/loader';

type AuthProviderProps = {
  children: React.ReactNode;
};

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('AuthProvider: Initializing auth state');

    const getInitialSession = async () => {
      console.log('AuthProvider: Getting initial session');
      const {
        data: { session },
        error
      } = await supabase.auth.getSession();
      if (error) {
        console.error('AuthProvider: Error getting session:', error);
      } else {
        console.log('AuthProvider: Session retrieved:', session);
        setSession(session);
        setUser(session?.user ?? null);
      }
      setLoading(false);
      console.log('AuthProvider: Loading set to false');
    };

    getInitialSession();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('AuthProvider: Auth state changed:', event, session);
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      console.log('AuthProvider: Cleaning up subscription');
      subscription.unsubscribe();
    };
  }, []);

  const value: AuthContextType = {
    user,
    session,
    loading
  };

  if (loading) {
    return <Loading />;
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
