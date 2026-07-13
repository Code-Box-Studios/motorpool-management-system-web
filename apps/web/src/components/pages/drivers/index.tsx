import MetricCard from '../../shared/metric-card';
import { Card, CardContent } from '@/components/ui/card';
import { TableSkeleton } from '@/components/shared/skeleton/table-skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { useDrivers, useAllDrivers } from '@/lib/query/drivers';
import { Button } from '@/components/ui/button';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Typography } from '@/components/ui/typography';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import PageHeader from '@/components/shared/page-header';
import StatusBadge from '@/components/shared/status-badge';

const Drivers = () => {
  const [page, setPage] = useState(1);
  const limit = 10;
  const { data: driversData, isLoading } = useDrivers(page, limit);
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

      <div className="mb-5 grid grid-cols-1 gap-5 sm:grid-cols-3">
        <MetricCard title="Total Drivers" value={totalCount} />
        <MetricCard title="On a Trip" value={onTrip} />
        <MetricCard title="Available" value={available} />
      </div>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <TableSkeleton
              columns={[
                { label: 'Full Name', width: 'w-32' },
                { label: 'License Number', width: 'w-32' },
                { label: 'Status', width: 'w-20' }
              ]}
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Full Name</TableHead>
                    <TableHead>License Number</TableHead>
                    <TableHead>Status</TableHead>
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
                        <TableCell className="font-medium">
                          {driver.full_name}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {driver.license_number}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={driver.status ?? ''} />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="text-muted-foreground py-8 text-center"
                      >
                        No drivers yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="mt-5 flex items-center justify-center">
                  <Button
                    variant={'ghost'}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft />
                  </Button>
                  <Typography variant={'p-xs'}>
                    {page} of {totalPages}
                  </Typography>
                  <Button
                    variant={'ghost'}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    <ChevronRight />
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Drivers;
