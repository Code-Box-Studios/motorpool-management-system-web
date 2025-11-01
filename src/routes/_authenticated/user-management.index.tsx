import UserManagement from '@/components/pages/user-management';
import { createFileRoute } from '@tanstack/react-router';
import { UserRoundCogIcon } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/user-management/')({
  component: UserManagement,
  staticData: {
    title: 'User Management',
    icon: UserRoundCogIcon,
    group: 'Settings'
  }
});
