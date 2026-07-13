import {
  createFileRoute,
  Outlet,
  useNavigate,
  useRouter
} from '@tanstack/react-router';
import AppHeader from '@/components/app-header';
import FocusHeader from '@/components/app-header/focus-header';
import { useEffect } from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/app-sidebar';
import { useAuth } from '@/hooks/use-auth';
import { useUserRole } from '@/hooks/use-user-role';
import { USER_ROLES } from '@/lib/enums';
import { getUserRoleName } from '@/lib/utils';

// Roles whose entire job is a single screen. They get a focus shell (no rail)
// and a header that names the screen they're actually on — rather than a
// navigation menu with nothing in it and a breadcrumb that says "Dashboard".
const FOCUS_SHELLS: Record<string, string> = {
  [USER_ROLES.security_guard]: 'Gate check',
  [USER_ROLES.evp_operations]: 'Approvals'
};

export const Route = createFileRoute('/_authenticated')({
  component: AuthenticatedLayout
});

function AuthenticatedLayout() {
  const { session, user } = useAuth();
  const { data: userRole } = useUserRole();
  const navigate = useNavigate();
  const router = useRouter();

  useEffect(() => {
    const checkAccess = async () => {
      if (!session) {
        navigate({ to: '/login' });
        return;
      }

      // Get the current route
      const currentRoute = router.state.location.pathname;
      const routes = router.routesByPath as unknown as Record<
        string,
        { options?: { staticData?: { allowedRoles?: string[] } } }
      >;
      const matchedRoute = routes[currentRoute];

      if (matchedRoute?.options?.staticData?.allowedRoles) {
        const allowedRoles = matchedRoute.options.staticData.allowedRoles;
        const userRoleName = await getUserRoleName(user?.user_metadata);

        if (!userRoleName || !allowedRoles.includes(userRoleName)) {
          // User doesn't have permission, redirect to dashboard
          navigate({ to: '/dashboard' });
          return;
        }
      }
    };

    checkAccess();
  }, [
    session,
    user,
    navigate,
    router.state.location.pathname,
    router.routesByPath
  ]);

  if (!session) {
    return <div>Loading...</div>;
  }

  // Guard and EVP get a focus shell: no rail, and a header that names the
  // screen they are actually looking at.
  const focusTitle = FOCUS_SHELLS[userRole?.roles?.name ?? ''];
  if (focusTitle) {
    return (
      <div className="bg-background min-h-dvh">
        <FocusHeader title={focusTitle} />
        <main>
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <div className="w-full">
        <AppHeader />
        <main className="p-5 md:p-11">
          <Outlet />
        </main>
      </div>
    </SidebarProvider>
  );
}
