import { useJobOrders } from '@/lib/query/job-orders';
import { Link, useNavigate } from '@tanstack/react-router';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import StatusBadge from '@/components/shared/status-badge';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { TableSkeleton } from '@/components/shared/skeleton/table-skeleton';

const JobOrdersPage = () => {
  const { data, isLoading } = useJobOrders(1, 100);
  const navigate = useNavigate();

  return (
    <div>
      <Card>
        <CardHeader>
          <CardTitle>Job Orders</CardTitle>
          <CardDescription>Manage and view job orders.</CardDescription>
          <CardAction>
            <Link
              to="/job-order/add-job-order"
              className={cn(buttonVariants())}
            >
              Create Job Order
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Incident Date</TableHead>
                  <TableHead>Assigned Mechanic</TableHead>
                  <TableHead>Target Date</TableHead>
                  <TableHead>Repair Progress</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.data?.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <StatusBadge status={order.status || 'pending'} />
                    </TableCell>
                    <TableCell>
                      {new Date(order.incident_date).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {order.assigned_mechanic || 'Not assigned'}
                    </TableCell>
                    <TableCell>
                      {order.target_date
                        ? new Date(order.target_date).toLocaleDateString()
                        : 'Not set'}
                    </TableCell>
                    <TableCell>
                      {order.repair_done !== null
                        ? `${order.repair_done}%`
                        : 'N/A'}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          navigate({ to: `/job-orders/${order.id}` })
                        }
                      >
                        View Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default JobOrdersPage;
