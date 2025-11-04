import { LoginForm } from '@/components/login/login-form';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_public/login')({
  component: RouteComponent
});

function RouteComponent() {
  return (
    <div className="bg w-full max-w-sm md:max-w-5xl">
      <LoginForm />
    </div>
  );
}
