import type { RouteStaticData } from '@/lib/types';
import { createFileRoute } from '@tanstack/react-router';
import { ClipboardList } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/job-order/')({
  component: RouteComponent,
  staticData: {
    title: 'Job Order',
    icon: ClipboardList,
    group: 'Management'
  } as RouteStaticData
});

function RouteComponent() {
  return <div>Hello "/job-order/"!</div>;
}
