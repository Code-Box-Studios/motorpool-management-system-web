import { useAuth } from '@/hooks/use-auth';
import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';

export const Route = createFileRoute('/_public')({
  component: PublicLayoutComponent
});

function PublicLayoutComponent() {
  const { session } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (session) {
      navigate({ to: '/dashboard' });
    }
  }, [session, navigate]);

  return (
    <div className="flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
      <Outlet />
    </div>
  );
}
