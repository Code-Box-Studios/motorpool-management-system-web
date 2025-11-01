import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_public')({
  component: PublicLayoutComponent
});

function PublicLayoutComponent() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
      <Outlet />
    </div>
  );
}
