import AddMaintenance from '@/components/pages/maintenance/add-maintenance/page';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/maintenance/add-maintenance')({
  component: AddMaintenance
});
