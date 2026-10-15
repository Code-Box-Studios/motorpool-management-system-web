import { USER_ROLES } from '@/lib/enums';
import AddTool from '@/components/pages/tools/add-tools';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/tools/add-tools')({
  staticData: { allowedRoles: [USER_ROLES.admin] },
  component: AddTool
});
