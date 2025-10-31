import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '../app-sidebar';
import AppHeader from '../app-header';

const AuthenticatedLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <SidebarProvider>
      <AppSidebar />
      <div className="w-full">
        <AppHeader />
        <main className="p-5">{children}</main>
      </div>
    </SidebarProvider>
  );
};

export default AuthenticatedLayout;
