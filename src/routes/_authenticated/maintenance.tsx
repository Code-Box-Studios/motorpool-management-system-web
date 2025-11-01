import { createFileRoute } from '@tanstack/react-router';
import { LucideCog } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/maintenance')({
  component: RouteComponent,
  staticData: {
    title: 'Maintenance',
    icon: LucideCog,
    group: 'Management'
  }
});

function RouteComponent() {
  return <div>Maintenance</div>;
}
