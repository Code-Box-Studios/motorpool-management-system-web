import { AddUser } from '@/components/pages/user-management/add-user';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_authenticated/user-management/add-user'
)({
  component: AddUser
});
