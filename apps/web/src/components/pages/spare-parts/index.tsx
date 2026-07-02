import { useSpareParts } from '@/lib/query/spare-parts';
import CardWithImage from '@/components/shared/card-with-image';
import { Link, useNavigate } from '@tanstack/react-router';
import { buttonVariants } from '@/components/ui/button';
import { Typography } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

const SpareParts = () => {
  const { data } = useSpareParts(1, 100);
  const navigate = useNavigate();

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <Typography variant={'h2'}>Spare Parts</Typography>
        <Link to="/spare-parts/add-spare-part" className={cn(buttonVariants())}>
          Add Spare Part
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3 lg:grid-cols-4">
        {data?.data && data.data.length > 0 ? (
          data.data.map((sparePart) => (
            <CardWithImage
              key={sparePart.id}
              imageSrc={sparePart.image ?? '/logo/mms-logo.png'}
              title={
                <Typography variant="h5" className="line-clamp-1">
                  {sparePart.name}
                </Typography>
              }
              description={
                <div className="space-y-1">
                  {sparePart.brand && (
                    <Typography
                      variant="p-sm"
                      className="text-muted-foreground"
                    >
                      Brand: {sparePart.brand}
                    </Typography>
                  )}
                  <Typography variant="p-sm">
                    Quantity: {sparePart.quantity ?? 0}
                  </Typography>
                  <Typography variant="p-sm" className="line-clamp-2">
                    {sparePart.description || 'No description'}
                  </Typography>
                </div>
              }
              primaryAction={() =>
                navigate({ to: `/spare-parts/${sparePart.id}` })
              }
              primaryButtonText="View Details"
            />
          ))
        ) : (
          <div className="text-muted-foreground col-span-full py-8 text-center">
            No spare parts found
          </div>
        )}
      </div>
    </div>
  );
};

export default SpareParts;
