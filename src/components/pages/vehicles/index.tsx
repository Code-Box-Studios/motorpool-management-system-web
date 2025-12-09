import { useVehicles } from '@/lib/query/vehicles';
import CardWithImage from '@/components/shared/card-with-image';
import { Link, useNavigate } from '@tanstack/react-router';
import { Button, buttonVariants } from '@/components/ui/button';
import { Typography } from '@/components/ui/typography';
import { cn } from '@/lib/utils';
import StatusBadge from '@/components/shared/status-badge';

const Vehicles = () => {
  const { data } = useVehicles(1, 10);
  const navigate = useNavigate();

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <Typography variant={'h2'}>Vehicles</Typography>
        <Link to="/vehicles/add-vehicle" className={cn(buttonVariants())}>
          Add Vehicle
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3 lg:grid-cols-4">
        {data?.data && data.data.length > 0 ? (
          data.data.map((vehicle) => (
            <CardWithImage
              key={vehicle.id}
              imageSrc={vehicle.images?.[0]}
              title={
                <div className="space-y-3">
                  <StatusBadge status={vehicle.status} />
                  <Typography variant="h5" className="line-clamp-1">
                    {vehicle.make} {vehicle.model} {vehicle.year}
                  </Typography>
                </div>
              }
              description={
                <div>
                  <Typography variant="p-sm">
                    License Plate: {vehicle.license_plate}
                  </Typography>
                  <Typography variant="p-sm">
                    Capacity: {vehicle.capacity}
                  </Typography>
                  <Typography variant="p-sm">
                    Branch: {vehicle.branch_name || vehicle.branch}
                  </Typography>
                </div>
              }
              primaryAction={() => navigate({ to: `/vehicles/${vehicle.id}` })}
              primaryButtonText="View Vehicle"
            />
          ))
        ) : (
          <div className="text-muted-foreground col-span-full py-8 text-center">
            No data found
          </div>
        )}
      </div>
      {data?.count && data.count > 10 && (
        <div className="mt-6 flex justify-center">
          <Button onClick={() => navigate({ to: '/vehicles' })}>
            Load More
          </Button>{' '}
        </div>
      )}
    </div>
  );
};

export default Vehicles;
