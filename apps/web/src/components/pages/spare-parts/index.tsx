import { useSpareParts } from '@/lib/query/spare-parts';
import { Link } from '@tanstack/react-router';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import PageHeader from '@/components/shared/page-header';
import EntityCard from '@/components/shared/entity-card';
import EmptyState from '@/components/shared/empty-state';

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
                fields={[
                  { label: 'Brand', value: sparePart.brand || '—' },
                  {
                    label: 'In stock',
                    // Running out is the thing worth noticing on this screen.
                    value: (
                      <span className={cn(quantity === 0 && 'text-signal')}>
                        {quantity}
                      </span>
                    )
                  }
                ]}
                footnote={sparePart.description}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SpareParts;
