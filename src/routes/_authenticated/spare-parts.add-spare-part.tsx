import { createFileRoute } from '@tanstack/react-router';
import AddSparePart from '@/components/pages/spare-parts/add-spare-part';

export const Route = createFileRoute(
  '/_authenticated/spare-parts/add-spare-part'
)({
  component: AddSparePart
});
