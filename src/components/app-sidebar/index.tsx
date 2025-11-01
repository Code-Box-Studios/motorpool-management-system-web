import React from 'react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from '@/components/ui/sidebar';
import { useRouter, Link } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import { Typography } from '../ui/typography';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/components/ui/collapsible';

interface MenuItem {
  title: string;
  icon: React.ComponentType;
  group: string;
  url: string;
}

interface NavItem {
  title: string;
  items: MenuItem[];
}

interface RouteWithStaticData {
  options: { staticData: Omit<MenuItem, 'url'> };
  path: string;
}

export function AppSidebar() {
  const router = useRouter();
  const routes = Object.values(router.routesByPath);

  if (!routes.length) {
    return null;
  }

  const routesWithData: RouteWithStaticData[] = routes.filter(
    (route): route is RouteWithStaticData => !!route.options?.staticData
  );

  const menuItems: MenuItem[] = routesWithData.map((route) => ({
    ...route.options.staticData,
    url: `/${route.path.replace('/_authenticated', '')}`
  }));

  const grouped: Record<string, MenuItem[]> = menuItems.reduce<
    Record<string, MenuItem[]>
  >(
    (acc, item) => {
      const group = item.group || 'Other';
      if (!acc[group]) acc[group] = [];
      acc[group].push(item);
      return acc;
    },
    {} as Record<string, MenuItem[]>
  );

  const navMain: NavItem[] = Object.entries(grouped).map(([title, items]) => ({
    title,
    items
  }));

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex justify-center space-x-1 pt-5">
          <img src="/logo/mms-logo.png" alt="Image" className="size-12" />
          <div>
            <Typography variant="h1" className="text-primary">
              MMS
            </Typography>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-0">
        {navMain?.map((item) => (
          <Collapsible
            key={item.title}
            title={item.title}
            defaultOpen
            className="group/collapsible"
          >
            <SidebarGroup>
              <SidebarGroupLabel
                asChild
                className="group/label text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-sm"
              >
                <CollapsibleTrigger>
                  {item.title}{' '}
                  <ChevronRight className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {item?.items?.map((subItem) => (
                      <SidebarMenuItem key={subItem.title}>
                        <SidebarMenuButton asChild>
                          <Link to={subItem.url}>
                            {subItem.icon && <subItem.icon />}
                            <span>{subItem.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        ))}
      </SidebarContent>
      <SidebarFooter />
    </Sidebar>
  );
}
