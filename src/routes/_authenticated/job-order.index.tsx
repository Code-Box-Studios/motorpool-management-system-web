import JobOrdersPage from '@/components/pages/job-order';
import { createFileRoute } from '@tanstack/react-router';
import { ClipboardList } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/job-order/')({
  component: JobOrdersPage,
  staticData: {
    title: 'Job Orders',
    icon: ClipboardList,
    group: 'Management'
  }
});
