import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router';
import AppHeader from '@/components/app-header';
import { useEffect } from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/app-sidebar';
import { useAuth } from '@/hooks/use-auth';

export const Route = createFileRoute('/_authenticated')({
  component: AuthenticatedLayout
});

function AuthenticatedLayout() {
  const { session } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!session) {
      navigate({ to: '/login' });
    }
  }, [session, navigate]);

  return (
    <SidebarProvider>
      <AppSidebar />
      <div className="w-full">
        <AppHeader />
        <main className="p-11 md:p-20">
          <Outlet />
        </main>
      </div>
    </SidebarProvider>
  );
}
