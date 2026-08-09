import { useVehicles } from '@/lib/query/vehicles';
import { Link, useNavigate } from '@tanstack/react-router';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useListControls } from '@/hooks/use-list-controls';
import PageHeader from '@/components/shared/page-header';
import SortableTableHead from '@/components/shared/sortable-table-head';
import EntityCard from '@/components/shared/entity-card';
import EntityImage from '@/components/shared/entity-image';
import EmptyState from '@/components/shared/empty-state';
import StatusBadge from '@/components/shared/status-badge';
import TablePagination from '@/components/shared/table-pagination';
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
  const { page, sort, setPage, handleSort } = useListControls();
  const limit = 10;
  const { data } = useVehicles(page, limit, sort ?? undefined);
  const navigate = useNavigate();
  const vehicles = data?.data ?? [];
  const totalCount = data?.count ?? 0;
  const totalPages = Math.ceil(totalCount / limit);

  // Grid and table are two shapes of the same paged slice, so the pager sits
  // under both and they stay in step when the view toggles.
  const grid = (
    <>
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

      <TablePagination
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
      />
    </>
  );

  const table = (
    <Card>
      <CardContent className="pt-6">
        {/* No fixed column widths. Pinning them summed to less than the table
            and auto-layout dumped every spare pixel into the LAST column, so the
            data bunched left behind a wide empty Branch. Left free, the browser
            spreads the slack across the columns in proportion to what is in
            them. Numbers are right-aligned so they line up to scan down. */}
        <Table>
          <TableHeader>
            <TableRow>
              {/* sortKey values come from the API's VEHICLE_SORT_COLUMNS
                  allowlist: `make` orders the composite Vehicle title,
                  `branch` orders by the related branch's name. */}
              <SortableTableHead
                label="Vehicle"
                sortKey="make"
                sort={sort}
                onSort={handleSort}
              />
              <SortableTableHead
                label="Plate"
                sortKey="licensePlate"
                sort={sort}
                onSort={handleSort}
              />
              <SortableTableHead
                label="Status"
                sortKey="status"
                sort={sort}
                onSort={handleSort}
              />
              <SortableTableHead
                label="Odometer"
                sortKey="mileage"
                sort={sort}
                onSort={handleSort}
                className="text-right"
              />
              <SortableTableHead
                label="Fuel"
                sortKey="fuelType"
                sort={sort}
                onSort={handleSort}
              />
              <SortableTableHead
                label="Seats"
                sortKey="capacity"
                sort={sort}
                onSort={handleSort}
                className="text-right"
              />
              <SortableTableHead
                label="Branch"
                sortKey="branch"
                sort={sort}
                onSort={handleSort}
              />
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
                <TableCell className="font-mono text-sm whitespace-nowrap">
                  {vehicle.license_plate}
                </TableCell>
                <TableCell>
                  <StatusBadge status={vehicle.status ?? ''} />
                </TableCell>
                <TableCell className="text-right text-sm whitespace-nowrap tabular-nums">
                  {odometer(vehicle.mileage) ?? '—'}
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">
                  {vehicle.fuel_type ? titleCase(vehicle.fuel_type) : '—'}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {vehicle.capacity ?? '—'}
                </TableCell>
                <TableCell className="text-sm">
                  {branchLabel(vehicle) ?? '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <TablePagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
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

      {/* The server count drives the empty state, so a page past the end of
          the list never reads as an empty fleet. */}
      {totalCount === 0 ? (
        <EmptyState message="No vehicles yet." />
      ) : (
        <ViewTabs grid={grid} table={table} />
      )}
    </div>
  );
};

export default Vehicles;
