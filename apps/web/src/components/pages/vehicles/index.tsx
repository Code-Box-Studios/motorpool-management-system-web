import { useVehicles } from '@/lib/query/vehicles';
import { Link } from '@tanstack/react-router';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import PageHeader from '@/components/shared/page-header';
import EntityCard from '@/components/shared/entity-card';
import EmptyState from '@/components/shared/empty-state';
import type { VehicleWithBranch } from '@/lib/types';

const titleCase = (value: string) =>
  value.replace(/\b\w/g, (c) => c.toUpperCase());

const odometer = (mileage: number | null) =>
  mileage == null ? undefined : `${mileage.toLocaleString()} km`;

// `branch_name` falls back to the raw branch id when the branch lookup misses,
// and to 'N/A' when the vehicle has no branch — neither is something to show.
const branchLabel = (vehicle: VehicleWithBranch) => {
  const name = vehicle.branch_name;
  if (!name || name === 'N/A' || name === vehicle.branch) return undefined;
  return name;
};

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
                { label: 'Plate', value: vehicle.license_plate, mono: true },
                { label: 'Odometer', value: odometer(vehicle.mileage) },
                {
                  label: 'Fuel',
                  value: vehicle.fuel_type
                    ? titleCase(vehicle.fuel_type)
                    : undefined
                },
                { label: 'Seats', value: vehicle.capacity },
                { label: 'Branch', value: branchLabel(vehicle) }
              ]}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default Vehicles;
