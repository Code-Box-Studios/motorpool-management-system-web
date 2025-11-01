import { createFileRoute } from '@tanstack/react-router';
import { CalendarCheck } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/reservations')({
  component: RouteComponent,
  staticData: {
    title: 'Reservations',
    icon: CalendarCheck,
    group: 'Management'
  }
});

function RouteComponent() {
  return <div>Hello "/reservations/"!</div>;
}
