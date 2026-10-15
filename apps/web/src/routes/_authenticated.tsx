import {
  createFileRoute,
  Outlet,
  useNavigate,
  useRouter,
  useMatches
} from '@tanstack/react-router';
import AppHeader from '@/components/app-header';
import FocusHeader from '@/components/app-header/focus-header';
import { useEffect } from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/app-sidebar';
import { useAuth } from '@/hooks/use-auth';
import { useUserRole } from '@/hooks/use-user-role';
import { BreadcrumbProvider } from '@/components/provider/breadcrumb-provider';
import { USER_ROLES } from '@/lib/enums';

// Roles whose entire job is a single screen. They get a focus shell (no rail)
// and a header that names the screen they're actually on — rather than a
// navigation menu with nothing in it and a breadcrumb that says "Dashboard".
const FOCUS_SHELLS: Record<string, string> = {
  [USER_ROLES.security_guard]: 'Gate check',
  [USER_ROLES.evp_operations]: 'Approvals',
  // The requester asks for a vehicle and waits — their dashboard already lists
  // every request they have made, and the rail it used to sit in held one other
  // item pointing at the same tickets from a page built for admins.
  [USER_ROLES.requester]: 'My Requests'
};

export const Route = createFileRoute('/_authenticated')({
  component: AuthenticatedLayout
});

function AuthenticatedLayout() {
  const { session } = useAuth();
  const { data: userRole } = useUserRole();
  const navigate = useNavigate();
  const router = useRouter();

  const matches = useMatches();
  const role = userRole?.roles?.name;
  // Resource indexes are siblings of their detail/create routes. Prefer the
  // deepest declared policy, then inherit the matched resource's index policy.
  const matchedRoutes = matches.map(
    (match) => router.routesById[match.routeId]
  );
  const explicitRoles = [...matchedRoutes]
    .reverse()
    .map(
      (route) =>
        (route.options.staticData as { allowedRoles?: string[] } | undefined)
          ?.allowedRoles
    )
    .find((roles) => roles !== undefined);
  const resource = matchedRoutes.at(-1)?.fullPath.split('/').filter(Boolean)[0];
  const indexRoute = Object.values(router.routesById).find(
    (route) => route.fullPath.replace(/\/$/, '') === `/${resource}`
  );
  const indexRoles = (
    indexRoute?.options.staticData as { allowedRoles?: string[] } | undefined
  )?.allowedRoles;
  const allowedRoles = explicitRoles ?? indexRoles;
  const denied = !!allowedRoles && (!role || !allowedRoles.includes(role));

  useEffect(() => {
    if (!session) {
      navigate({ to: '/login', replace: true });
    } else if (denied) {
      navigate({ to: '/dashboard', replace: true });
    }
  }, [session, denied, navigate]);

  if (!session || denied) return <div>Loading...</div>;

  // Guard and EVP get a focus shell: no rail, and a header that names the
  // screen they are actually looking at.
  const focusTitle = FOCUS_SHELLS[userRole?.roles?.name ?? ''];
  if (focusTitle) {
    return (
      <div className="bg-background min-h-dvh">
        <FocusHeader title={focusTitle} />
        {/* The gutter lives here, not in each page. The gate and approvals
            screens were written self-padding because this shell gave them
            nothing, which left any page shared with the sidebar shell — the
            profile — flush against the edge of a phone. Those two still carry
            their own px-4, so they are unchanged; new focus pages get a
            sensible margin for free. */}
        <main className="px-4 py-6 md:px-6">
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <BreadcrumbProvider>
      <SidebarProvider>
        <AppSidebar />
        {/* min-w-0: this is a flex child, and a flex item defaults to
            min-width:auto — it refuses to shrink below its content. A wide
            table (the job-order row actions push it past 1180px) would then
            widen this whole column past the viewport, scrolling the PAGE
            sideways and clipping the actions, instead of scrolling inside the
            table's own overflow container. */}
        <div className="w-full min-w-0">
          <AppHeader />
          {/* Capped so tables and cards do not stretch into unreadable line
              lengths on a wide monitor. */}
          <main className="mx-auto w-full max-w-[1600px] p-5 md:p-10">
            <Outlet />
          </main>
        </div>
      </SidebarProvider>
    </BreadcrumbProvider>
  );
}
