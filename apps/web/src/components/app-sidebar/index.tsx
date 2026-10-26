import React, { useEffect, useState } from 'react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from '@/components/ui/sidebar';
import { useRouter, useLocation, Link } from '@tanstack/react-router';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { useSidebar } from '@/components/context/sidebar-context';
import { getUserRoleName } from '@/lib/utils';
import { TestAccountSwitcher } from '@/components/shared/test-account-switcher';

interface MenuItem {
  title: string;
  icon: React.ComponentType;
  group: string;
  url: string;
  allowedRoles?: string[];
}

interface NavItem {
  title: string;
  items: MenuItem[];
}

interface RouteWithStaticData {
  options: { staticData: MenuItem };
  path: string;
}

const navigationGroups = [
  {
    title: 'Operations',
    items: [
      'Dashboard',
      'Trip Tickets',
      'GPS Map',
      'Job Orders',
      'Maintenance',
      'Reports'
    ]
  },
  {
    title: 'Fleet & inventory',
    items: ['Vehicles', 'Drivers', 'Trackers', 'Spare Parts', 'Tools']
  },
  { title: 'Administration', items: ['Organization', 'User Management'] }
];

export function AppSidebar() {
  const router = useRouter();
  const { user } = useAuth();
  const pathname = useLocation({ select: (location) => location.pathname });
  const { isMobile, setOpenMobile } = useSidebar();

  useEffect(() => {
    setOpenMobile(false);
  }, [pathname, setOpenMobile]);
  const routes = Object.values(router.routesByPath);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserRole = async () => {
      if (user?.user_metadata) {
        const role = await getUserRoleName(user.user_metadata);
        setUserRole(role);
      } else {
        setUserRole(null);
      }
    };

    fetchUserRole();
  }, [user?.user_metadata]);

  if (!routes.length) {
    return null;
  }

  const routesWithData: RouteWithStaticData[] = routes.filter(
    (route): route is RouteWithStaticData => !!route.options?.staticData?.title
  );

  const allowedRoutes = routesWithData.filter((route) => {
    const allowedRoles = route.options.staticData.allowedRoles;
    if (!allowedRoles) return true;

    return userRole && allowedRoles.includes(userRole);
  });

  const menuItems: MenuItem[] = allowedRoutes.map((route) => ({
    ...route.options.staticData,
    url:
      `/${route.path.replace('/_authenticated', '')}`
        .replace(/\/+/g, '/')
        .replace(/\/$/, '') || '/'
  }));

  const navMain: NavItem[] = navigationGroups.map((group) => ({
    title: group.title,
    items: group.items.flatMap((title) =>
      menuItems.filter((item) => item.title === title)
    )
  }));
  const otherItems = menuItems.filter(
    (item) =>
      !navigationGroups.some((group) => group.items.includes(item.title))
  );
  if (otherItems.length) navMain.push({ title: 'Other', items: otherItems });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-sidebar-border border-b p-2">
        <div className="flex min-h-14 items-center gap-2.5 px-1 group-data-[collapsible=icon]:px-0">
          <img
            src="/logo/mms-logo.png"
            alt=""
            className="size-8 shrink-0 object-contain"
          />
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="text-primary text-base font-bold tracking-tight">
              MMS
            </p>
            <p className="text-muted-foreground truncate text-xs">
              Motorpool management
            </p>
          </div>
          {isMobile && (
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto"
              aria-label="Close navigation"
              onClick={() => setOpenMobile(false)}
            >
              <X aria-hidden="true" />
            </Button>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-1 py-2">
        <nav aria-label="Main navigation">
          {navMain
            .filter((group) => group.items.length > 0)
            .map((group) => (
              <SidebarGroup key={group.title} className="py-1">
                <SidebarGroupLabel className="text-muted-foreground h-7 text-[11px] font-semibold tracking-wider uppercase group-data-[collapsible=icon]:hidden">
                  {group.title}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => {
                      const active =
                        pathname === item.url ||
                        pathname.startsWith(`${item.url}/`);
                      return (
                        <SidebarMenuItem key={item.url}>
                          <SidebarMenuButton
                            asChild
                            isActive={active}
                            tooltip={item.title}
                            className="data-[active=true]:bg-primary/10 data-[active=true]:text-primary h-9 gap-3 rounded-lg px-3 data-[active=true]:font-semibold"
                          >
                            <Link
                              to={item.url}
                              aria-label={item.title}
                              aria-current={active ? 'page' : undefined}
                              onClick={() => {
                                if (isMobile) setOpenMobile(false);
                              }}
                            >
                              {item.icon && <item.icon />}
                              <span>{item.title}</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
        </nav>
      </SidebarContent>
      <TestAccountSwitcher sidebar />
    </Sidebar>
  );
}
