import SparePartsInner from '@/components/pages/spare-parts/spare-parts-inner';
import { createFileRoute, useParams } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_authenticated/spare-parts/$sparePartId'
)({
  component: RouteComponent
});

function RouteComponent() {
  const { sparePartId } = useParams({
    from: '/_authenticated/spare-parts/$sparePartId'
  });
  return <SparePartsInner sparePartId={sparePartId} />;
}
