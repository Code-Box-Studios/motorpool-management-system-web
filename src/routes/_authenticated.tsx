import {
  createFileRoute,
  Outlet,
  useNavigate,
  useRouter
} from '@tanstack/react-router';
import AppHeader from '@/components/app-header';
import { useEffect } from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/app-sidebar';
import { useAuth } from '@/hooks/use-auth';
import { getUserRoleName } from '@/lib/utils';

export const Route = createFileRoute('/_authenticated')({
  component: AuthenticatedLayout
});

function AuthenticatedLayout() {
  const { session, user } = useAuth();
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
