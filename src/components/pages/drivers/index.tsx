import MetricCard from '../../shared/metric-card';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { TableSkeleton } from '@/components/shared/skeleton/table-skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { useDrivers } from '@/lib/query/drivers';
import { Button } from '@/components/ui/button';
import { Link } from '@tanstack/react-router';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Typography } from '@/components/ui/typography';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const Drivers = () => {
  const [page, setPage] = useState(1);
  const limit = 10;
  const { data: driversData, isLoading } = useDrivers(page, limit);
  const navigate = useNavigate();
  const drivers = driversData?.data || [];
  const totalCount = driversData?.count || 0;
  const totalPages = Math.ceil(totalCount / limit);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-5">
        <MetricCard title="Total Drivers" value={totalCount} />
        <MetricCard title="On-trip Driver" value={5} />
        <MetricCard title="Available Drivers" value={6} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Drivers</CardTitle>
          <CardDescription>Manage and view driver details.</CardDescription>
          <CardAction>
            <Button>
              <Link to="/drivers/add-driver">Add Driver</Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
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
                  {drivers.map((driver) => (
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
                      <TableCell>{driver.full_name}</TableCell>
                      <TableCell>{driver.license_number}</TableCell>
                      <TableCell>{driver.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Drivers;
