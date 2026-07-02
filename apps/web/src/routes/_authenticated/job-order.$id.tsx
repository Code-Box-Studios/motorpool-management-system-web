import JobOrderInner from '@/components/pages/job-order/job-order-inner';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/job-order/$id')({
  component: JobOrderInner
});
