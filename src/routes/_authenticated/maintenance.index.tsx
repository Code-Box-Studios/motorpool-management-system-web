import MaintenancePage from '@/components/pages/maintenance';
import { createFileRoute } from '@tanstack/react-router';
import { LucideCog } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/maintenance/')({
  component: MaintenancePage,
  staticData: {
    title: 'Maintenance',
    icon: LucideCog,
    group: 'Management'
  }
});
