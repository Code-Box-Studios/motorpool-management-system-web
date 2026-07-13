import { useVehicles } from '@/lib/query/vehicles';
import { Link } from '@tanstack/react-router';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import PageHeader from '@/components/shared/page-header';
import EntityCard from '@/components/shared/entity-card';
import EmptyState from '@/components/shared/empty-state';

const Vehicles = () => {
  const { data } = useVehicles(1, 12);
  const vehicles = data?.data ?? [];

  return (
    <div>
      <PageHeader
        title="Vehicles"
        description="Every vehicle in the fleet, and what it is doing right now."
        action={
          <Link to="/vehicles/add-vehicle" className={cn(buttonVariants())}>
            Add Vehicle
          </Link>
        }
      />

      {vehicles.length === 0 ? (
        <EmptyState message="No vehicles yet." />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {vehicles.map((vehicle) => (
            <EntityCard
              key={vehicle.id}
              to={`/vehicles/${vehicle.id}`}
              imageSrc={vehicle.images?.[0]}
              status={vehicle.status}
              title={`${vehicle.make} ${vehicle.model} ${vehicle.year ?? ''}`.trim()}
              fields={[
                {
                  label: 'Plate',
                  value: (
                    <span className="font-mono">{vehicle.license_plate}</span>
                  )
                },
                { label: 'Seats', value: vehicle.capacity ?? '—' },
                {
                  label: 'Branch',
                  value: vehicle.branch_name || vehicle.branch || '—'
                }
              ]}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default Vehicles;
