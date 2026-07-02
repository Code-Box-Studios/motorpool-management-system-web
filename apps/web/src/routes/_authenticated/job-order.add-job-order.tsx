import AddJobOrder from '@/components/pages/job-order/add-job-order/page';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/job-order/add-job-order')(
  {
    component: AddJobOrder
  }
);
