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
import {
  Calendar,
  CarIcon,
  ClipboardList,
  LayoutDashboard,
  Settings,
  Users2,
  Wrench
} from 'lucide-react';
import { Typography } from '../ui/typography';

const routeIcons: Record<string, React.ComponentType> = {
  'dashboard/': LayoutDashboard,
  'assets/': CarIcon,
  'drivers/': Users2,
  'job-order/': ClipboardList,
  'maintenance-schedule/': Wrench,
  'reservations/': Calendar
};

export function AppSidebar() {
  const router = useRouter();
  const routes = Object.values(router.routesByPath);

  const order = Object.keys(routeIcons);
  const items = routes
    .filter((route) => route.path !== '__root' && route.path in routeIcons)
    .map((route) => ({
      title: route.path.replace('/', '').replace('-', ' ').toUpperCase(),
      url: `/${route.path}`,
      path: route.path,
      icon: routeIcons[route.path] || Settings
    }))
    .sort((a, b) => order.indexOf(a.path) - order.indexOf(b.path));

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
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <Link to={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter />
    </Sidebar>
  );
}
