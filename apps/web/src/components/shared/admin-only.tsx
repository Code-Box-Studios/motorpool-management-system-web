import type { ReactNode } from 'react';
import { Navigate } from '@tanstack/react-router';
import { useUserRole } from '@/hooks/use-user-role';
import { USER_ROLES } from '@/lib/enums';

// Renders its children for admins only; everyone else is bounced to /dashboard.
// The `_authenticated` guard keys `staticData.allowedRoles` off the pathname, so
// it cannot gate dynamic routes — and adding `staticData` to a sub-route would
// surface it as a sidebar menu item. Wrap the page component with this instead.
// Safe to read the role synchronously: AuthProvider blocks render until the
// session resolves, so `user` is already populated inside any authed route.
export const AdminOnly = ({ children }: { children: ReactNode }) => {
  const { data: userRole } = useUserRole();

  if (userRole?.roles?.name !== USER_ROLES.admin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};
