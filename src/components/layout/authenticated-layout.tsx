import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '../app-sidebar';
import AppHeader from '../app-header';

const AuthenticatedLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="w-full">
        <AppHeader />
        {children}
      </main>
    </SidebarProvider>
  );
};

export default AuthenticatedLayout;
