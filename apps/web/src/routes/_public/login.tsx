import { LoginForm } from '@/components/login/login-form';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_public/login')({
  component: RouteComponent
});

function RouteComponent() {
  return (
    <div className="w-full max-w-[1180px]">
      <LoginForm />
    </div>
  );
}
