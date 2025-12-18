import { createFileRoute } from '@tanstack/react-router';
import { Package } from 'lucide-react';
import SpareParts from '@/components/pages/spare-parts';
import { USER_ROLES } from '@/lib/enums';

export const Route = createFileRoute('/_authenticated/spare-parts/')({
  component: SpareParts,
  staticData: {
    title: 'Spare Parts',
    icon: Package,
    group: 'Assets',
    allowedRoles: [USER_ROLES.admin]
  }
});
