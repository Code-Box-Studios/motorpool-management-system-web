import { createFileRoute, redirect } from '@tanstack/react-router';
import { getAccessToken } from '@/lib/api/client';

export const Route = createFileRoute('/')({
  // Safe to read the in-memory token synchronously here: AuthProvider renders
  // <Loading/> in place of its children (which include <RouterProvider>) until
  // the initial getCurrentUser() boot settles, so this beforeLoad never runs
  // before the token/auth state is resolved — no redirect loop on hard refresh.
  beforeLoad: () => {
    throw redirect({ to: getAccessToken() ? '/dashboard' : '/login' });
  }
});
