import { SessionCoordinationError } from '@/lib/api/session-coordination';
import { hasPendingLogout } from '@/lib/api/logout-intent';
import React, { Fragment, useEffect, useRef, useState } from 'react';
import { getCurrentUser, signIn, signOut } from '@/lib/api/auth';
import { onAuthFailure, resetAuthSession } from '@/lib/api/client';
import type { AppUser } from '@/lib/types';
import { AuthContext, type AuthContextType } from '../context/auth-context';
import { Loading } from '../ui/loader';
import { Button } from '../ui/button';
import ThemeSwitcher from '../app-header/theme-switcher';

type AuthProviderProps = {
  children: React.ReactNode;
};

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [logoutPending, setLogoutPending] = useState(hasPendingLogout);
  const pendingLogout = useRef(logoutPending);
  const [sessionRevision, setSessionRevision] = useState(0);
  const operation = useRef(0);

  useEffect(() => {
    // If a silent refresh fails mid-session, drop auth (guards route to /login).
    let active = true;
    const bootOperation = operation.current;
    const unsubscribe = onAuthFailure(() => {
      pendingLogout.current = hasPendingLogout();
      setLogoutPending(pendingLogout.current);
      operation.current += 1;
      resetAuthSession();
      setUser(null);
      setSessionRevision((revision) => revision + 1);
      setLoading(false);
    });
    if (pendingLogout.current) {
      // A surviving refresh cookie must not restore a session while logout is
      // pending or its intent cannot safely be checked.
      resetAuthSession();
      setLoading(false);
    } else {
      getCurrentUser()
        .then((u) => {
          if (active && operation.current === bootOperation) setUser(u);
        })
        .finally(() => {
          if (active && operation.current === bootOperation) setLoading(false);
        });
    }
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // login/logout live on the context (no side-effect-in-render hack). The login
  // form calls auth.login(...); the user menu calls auth.logout().
  const login: AuthContextType['login'] = async (email, password) => {
    if (pendingLogout.current) {
      throw new Error('Finish signing out before signing in again.');
    }
    const loginOperation = ++operation.current;
    if (user) {
      setUser(null);
      setSessionRevision((revision) => revision + 1);
    }
    const nextUser = await signIn(email, password);
    if (operation.current !== loginOperation) return;
    setUser(nextUser);
    setSessionRevision((revision) => revision + 1);
  };
  const logout: AuthContextType['logout'] = async () => {
    const logoutOperation = ++operation.current;
    setLogoutError(null);
    resetAuthSession();
    pendingLogout.current = true;
    setLogoutPending(true);
    setUser(null);
    setSessionRevision((revision) => revision + 1);
    // Finish clearing the old refresh cookie before another login is possible.
    setLoading(true);
    try {
      await signOut();
    } catch (error) {
      if (
        operation.current === logoutOperation &&
        error instanceof SessionCoordinationError
      )
        setLogoutError(error.message);
      throw error;
    } finally {
      // A peer completion can invalidate this local operation while its queued
      // logout is still valid. Reconcile the gate after that transport settles.
      pendingLogout.current = hasPendingLogout();
      setLogoutPending(pendingLogout.current);
      if (operation.current === logoutOperation) setLoading(false);
    }
  };

  const value: AuthContextType = {
    user,
    session: user ? { authenticated: true } : null,
    loading,
    login,
    logout
  };

  if (logoutPending) {
    return (
      <main className="bg-background text-foreground grid min-h-svh place-items-center px-6 py-16">
        <div className="fixed top-4 right-4">
          <ThemeSwitcher />
        </div>
        <section
          aria-labelledby="logout-heading"
          aria-busy={loading}
          className="border-border bg-card w-full max-w-md space-y-5 rounded-2xl border p-6 shadow-sm"
        >
          <p className="text-muted-foreground text-sm">
            Motorpool Management System
          </p>
          <h1 id="logout-heading" className="text-2xl font-semibold">
            {loading ? 'Signing out…' : 'Finish signing out'}
          </h1>
          <p
            role={loading ? 'status' : 'alert'}
            className="text-muted-foreground text-sm leading-relaxed"
          >
            {loading
              ? 'Your workspace is hidden while sign-out finishes.'
              : 'Your workspace is hidden until sign-out is confirmed. Retry to finish signing out before signing in again.'}
          </p>
          {logoutError && (
            <p role="alert" className="text-sm">
              {logoutError}
            </p>
          )}
          <Button
            disabled={loading}
            onClick={() => void logout().catch(() => undefined)}
          >
            {loading ? 'Signing out…' : 'Retry sign-out'}
          </Button>
        </section>
      </main>
    );
  }

  if (loading) {
    return <Loading fullScreen />;
  }

  return (
    <AuthContext.Provider value={value}>
      <Fragment key={`${sessionRevision}:${user?.id ?? 'anonymous'}`}>
        {children}
      </Fragment>
    </AuthContext.Provider>
  );
};
