import { useSpareParts } from '@/lib/query/spare-parts';
import { Link } from '@tanstack/react-router';
import { buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import PageHeader from '@/components/shared/page-header';
import EntityCard from '@/components/shared/entity-card';
import EmptyState from '@/components/shared/empty-state';

// The shelf is the point of this screen, so every part carries a stock pill in
// the same slot the other grids give a status: what is gone, what is nearly
// gone, what is fine. Tones are the shared semantic five — no new colours.
const LOW_STOCK_THRESHOLD = 5;

const stockBadge = (quantity: number) => {
  if (quantity === 0) return <Badge variant="stop">Out of stock</Badge>;
  if (quantity <= LOW_STOCK_THRESHOLD)
    return <Badge variant="wait">Low stock</Badge>;
  return <Badge variant="done">In stock</Badge>;
};

const SpareParts = () => {
  const { data } = useSpareParts(1, 100);
  const spareParts = data?.data ?? [];

  return (
    <div>
      <PageHeader
        title="Spare Parts"
        description="What is on the shelf, and how much of it is left."
        action={
          <Link
            to="/spare-parts/add-spare-part"
            className={cn(buttonVariants())}
          >
            Add Spare Part
          </Link>
        }
      />

      {spareParts.length === 0 ? (
        <EmptyState message="No spare parts yet." />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {spareParts.map((sparePart) => {
            const quantity = sparePart.quantity ?? 0;
            return (
              <EntityCard
                key={sparePart.id}
                to={`/spare-parts/${sparePart.id}`}
                imageSrc={sparePart.image}
                title={sparePart.name}
                badge={stockBadge(quantity)}
                footnote={sparePart.description}
                fields={[
                  { label: 'Brand', value: sparePart.brand },
                  { label: 'On hand', value: quantity }
                ]}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SpareParts;
