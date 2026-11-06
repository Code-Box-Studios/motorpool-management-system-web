import { createFileRoute } from '@tanstack/react-router';
import { BookOpen } from 'lucide-react';
import DocsPage from '@/components/pages/docs';
import { USER_ROLES } from '@/lib/enums';

export const Route = createFileRoute('/_authenticated/docs')({
  component: DocsPage,
  staticData: {
    title: 'Docs',
    icon: BookOpen,
    group: 'Settings',
    allowedRoles: [USER_ROLES.admin]
  }
});
