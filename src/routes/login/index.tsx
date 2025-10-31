import PublicLayout from '@/components/layout/public-layout';
import { LoginForm } from '@/components/login/login-form';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/login/')({
  component: RouteComponent
});

function RouteComponent() {
  return (
    <PublicLayout>
      <div className="bg w-full max-w-sm md:max-w-5xl">
        <LoginForm />
      </div>
    </PublicLayout>
  );
}
