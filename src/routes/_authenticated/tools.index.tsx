import { createFileRoute } from '@tanstack/react-router';
import { Settings } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/tools/')({
  component: RouteComponent,
  staticData: {
    title: 'Tools',
    icon: Settings,
    group: 'Assets'
  }
});

function RouteComponent() {
  return <div>Hello "/assets/tools/"!</div>;
}
