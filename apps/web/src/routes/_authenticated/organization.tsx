import Organization from '@/components/pages/organization';
import { USER_ROLES } from '@/lib/enums';
import { createFileRoute } from '@tanstack/react-router';
import { Building2 } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/organization')({
  component: Organization,
  staticData: {
    title: 'Organization',
    icon: Building2,
    group: 'Settings',
    allowedRoles: [USER_ROLES.admin]
  }
});
