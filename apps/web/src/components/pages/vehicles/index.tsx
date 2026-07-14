import { useVehicles } from '@/lib/query/vehicles';
import { Link, useNavigate } from '@tanstack/react-router';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import PageHeader from '@/components/shared/page-header';
import EntityCard from '@/components/shared/entity-card';
import EntityImage from '@/components/shared/entity-image';
import EmptyState from '@/components/shared/empty-state';
import StatusBadge from '@/components/shared/status-badge';
import ViewTabs from '@/components/shared/view-tabs';
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

const vehicleTitle = (vehicle: VehicleWithBranch) =>
  `${vehicle.make} ${vehicle.model} ${vehicle.year ?? ''}`.trim();

const Vehicles = () => {
  const { data } = useVehicles(1, 12);
  const navigate = useNavigate();
  const vehicles = data?.data ?? [];

  const grid = (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {vehicles.map((vehicle) => (
        <EntityCard
          key={vehicle.id}
          to={`/vehicles/${vehicle.id}`}
          imageSrc={vehicle.images?.[0]}
          status={vehicle.status}
          title={vehicleTitle(vehicle)}
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
  );

  const table = (
    <Card>
      <CardContent className="pt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[280px]">Vehicle</TableHead>
              <TableHead className="w-[110px]">Plate</TableHead>
              <TableHead className="w-[130px]">Status</TableHead>
              <TableHead className="w-[110px]">Odometer</TableHead>
              <TableHead className="w-[90px]">Fuel</TableHead>
              <TableHead className="w-[70px]">Seats</TableHead>
              <TableHead>Branch</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vehicles.map((vehicle) => (
              <TableRow
                key={vehicle.id}
                className="hover:bg-muted cursor-pointer"
                onClick={() =>
                  navigate({
                    to: '/vehicles/$vehicleId',
                    params: { vehicleId: vehicle.id }
                  })
                }
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <EntityImage
                      src={vehicle.images?.[0]}
                      alt=""
                      className="border-border h-10 w-14 shrink-0 rounded-md border"
                    />
                    <span className="font-medium">{vehicleTitle(vehicle)}</span>
                  </div>
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {vehicle.license_plate}
                </TableCell>
                <TableCell>
                  <StatusBadge status={vehicle.status ?? ''} />
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">
                  {odometer(vehicle.mileage) ?? '—'}
                </TableCell>
                <TableCell className="text-sm">
                  {vehicle.fuel_type ? titleCase(vehicle.fuel_type) : '—'}
                </TableCell>
                <TableCell className="text-sm">
                  {vehicle.capacity ?? '—'}
                </TableCell>
                <TableCell className="text-sm">
                  {branchLabel(vehicle) ?? '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

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
        <ViewTabs grid={grid} table={table} />
      )}
    </div>
  );
};

export default Vehicles;
