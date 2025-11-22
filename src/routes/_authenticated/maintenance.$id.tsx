import MaintenanceInner from '@/components/pages/maintenance/maintenance-inner';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/maintenance/$id')({
  component: MaintenanceInner
});
