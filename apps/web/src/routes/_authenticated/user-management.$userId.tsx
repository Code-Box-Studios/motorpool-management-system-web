import UserInner from '@/components/pages/user-management/user-inner';
import { createFileRoute, useParams } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/user-management/$userId')({
  component: RouteComponent
});

function RouteComponent() {
  const { userId } = useParams({
    from: '/_authenticated/user-management/$userId'
  });

  return <UserInner userId={userId} />;
}
