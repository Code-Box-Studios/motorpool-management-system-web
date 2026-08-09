import { MetricStrip } from '../../shared/metric-card';
import { Card, CardContent } from '@/components/ui/card';
import { TableSkeleton } from '@/components/shared/skeleton/table-skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { useDrivers, useAllDrivers } from '@/lib/query/drivers';
import { useNavigate } from '@tanstack/react-router';
import EntityImage from '@/components/shared/entity-image';
import TablePagination from '@/components/shared/table-pagination';
import SortableTableHead from '@/components/shared/sortable-table-head';
import { useListControls } from '@/hooks/use-list-controls';
import PageHeader from '@/components/shared/page-header';
import StatusBadge from '@/components/shared/status-badge';

// sortKey values come from the API's DRIVER_SORT_COLUMNS allowlist.
const COLUMNS = [
  { label: 'Driver', width: 'w-40', sortKey: 'fullName' },
  { label: 'License', width: 'w-32', sortKey: 'licenseNumber' },
  { label: 'Contact', width: 'w-32', sortKey: 'phone' },
  { label: 'Status', width: 'w-20', sortKey: 'status' }
];

const Drivers = () => {
  const { page, sort, setPage, handleSort } = useListControls();
  const limit = 10;
  const { data: driversData, isLoading } = useDrivers(
    page,
    limit,
    sort ?? undefined
  );
  const { data: allDrivers } = useAllDrivers();
  const navigate = useNavigate();
  const drivers = driversData?.data || [];
  const totalCount = driversData?.count || 0;
  const totalPages = Math.ceil(totalCount / limit);

  // These three used to be hardcoded (5 and 6), so "on trip" plus "available"
  // could exceed the total. They are counted from the roster now.
  const onTrip = (allDrivers ?? []).filter(
    (d) => d.status === 'on_trip'
  ).length;
  const available = (allDrivers ?? []).filter(
    (d) => d.status === 'active'
  ).length;

  return (
    <div>
      <PageHeader
        title="Drivers"
        description="Who is on the roster, and who is free to take a trip."
      />

      <MetricStrip
        className="mb-5"
        metrics={[
          { label: 'Total Drivers', value: totalCount },
          { label: 'On a Trip', value: onTrip },
          { label: 'Available', value: available }
        ]}
      />

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <TableSkeleton columns={COLUMNS} />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    {COLUMNS.map((column) => (
                      <SortableTableHead
                        key={column.label}
                        label={column.label}
                        sortKey={column.sortKey}
                        sort={sort}
                        onSort={handleSort}
                      />
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drivers.length > 0 ? (
                    drivers.map((driver) => (
                      <TableRow
                        key={driver.id}
                        className="hover:bg-muted cursor-pointer"
                        onClick={() =>
                          navigate({
                            to: '/drivers/$id',
                            params: { id: driver.id }
                          })
                        }
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <EntityImage
                              src={driver.photo}
                              alt=""
                              className="border-border size-10 shrink-0 rounded-full border"
                            />
                            <div className="min-w-0">
                              <div className="font-medium">
                                {driver.full_name}
                              </div>
                              {driver.email && (
                                <div className="text-muted-foreground text-xs">
                                  {driver.email}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-mono text-sm">
                            {driver.license_number || '—'}
                          </div>
                          {driver.license_type && (
                            <div className="text-muted-foreground text-xs">
                              {driver.license_type}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {driver.phone || '—'}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={driver.status ?? ''} />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={COLUMNS.length}
                        className="text-muted-foreground py-8 text-center"
                      >
                        No drivers yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              <TablePagination
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Drivers;
