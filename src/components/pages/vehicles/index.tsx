import { useVehicles } from '@/lib/query/vehicles';
import CardWithImage from '@/components/shared/card-with-image';
import { Link, useNavigate } from '@tanstack/react-router';
import { Button, buttonVariants } from '@/components/ui/button';
import { Typography } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

const Vehicles = () => {
  const { data } = useVehicles(1, 10);
  const navigate = useNavigate();

  return (
    <div>
      <div className="flex items-center justify-between">
        <Typography variant={'h2'} className="mb-4">
          Vehicles
        </Typography>
        <Link to="/vehicles/add-vehicle" className={cn(buttonVariants())}>
          Add Vehicle
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3 lg:grid-cols-4">
        {data?.data?.map((vehicle) => (
          <CardWithImage
            key={vehicle.id}
            imageSrc={vehicle.images?.[0]}
            title={`${vehicle.make} ${vehicle.model}`}
            description={`Year: ${vehicle.year}, License: ${vehicle.license_plate}`}
            primaryAction={() => navigate({ to: `/vehicles/${vehicle.id}` })}
            status={vehicle.status.replace('_', ' ')}
          />
        ))}
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
