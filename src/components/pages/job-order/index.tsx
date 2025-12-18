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
import { NoteJobOrderModal } from './job-order-inner/note-job-order-modal';
import { ApproveJobOrderModal } from './job-order-inner/approve-job-order-modal';
import { CompleteRepairModal } from './job-order-inner/complete-repair-modal';
import { useDrivers } from '@/lib/query/drivers';
import { useUpdateJobOrder } from '@/lib/mutation/job-orders';
import type { NoteJobOrderData } from './job-order-inner/note-job-order-modal';
import type { ApproveJobOrderData } from './job-order-inner/approve-job-order-modal';
import type { CompleteRepairData } from './job-order-inner/complete-repair-modal';
import { Eye } from 'lucide-react';
import { useUserRole } from '@/hooks/use-user-role';

const JobOrdersPage = () => {
  const { data, isLoading } = useJobOrders(1, 100);
  const { data: drivers } = useDrivers(1, 1000);
  const { data: userRole } = useUserRole();
  const updateJobOrder = useUpdateJobOrder();
  const navigate = useNavigate();

  const isAdmin = userRole?.roles?.name?.toLowerCase() === 'admin';
  const isEVP = userRole?.roles?.name?.toLowerCase() === 'evp_operations';

  // Helper function to get driver name by ID
  const getDriverName = (driverId: string | null) => {
    if (!driverId) return 'Not assigned';
    const driver = drivers?.data?.find((d) => d.id === driverId);
    return driver?.full_name || 'Unknown';
  };

  const handleNoteJobOrder = (orderId: string, data: NoteJobOrderData) => {
    const order = tableData?.data?.find((o) => o.id === orderId);
    if (!order) return;

    // Remove vehicles relationship from the order object before updating
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { vehicles, ...orderWithoutRelations } = order;

    const updatedData = {
      ...orderWithoutRelations,
      ...data
    };

    updateJobOrder
      .mutateAsync({
        id: orderId,
        updates: updatedData
      })
      .catch((error) => {
        console.error('Error noting job order:', error);
      });
  };

  const handleApproveJobOrder = (
    orderId: string,
    data: ApproveJobOrderData
  ) => {
    const order = tableData?.data?.find((o) => o.id === orderId);
    if (!order) return;

    // Remove vehicles relationship from the order object before updating
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { vehicles, ...orderWithoutRelations } = order;

    const updatedData = {
      ...orderWithoutRelations,
      ...data
    };

    updateJobOrder
      .mutateAsync({
        id: orderId,
        updates: updatedData
      })
      .catch((error) => {
        console.error('Error approving job order:', error);
      });
  };

  const handleCompleteRepair = (orderId: string, data: CompleteRepairData) => {
    const order = tableData?.data?.find((o) => o.id === orderId);
    if (!order) return;

    // Remove vehicles relationship from the order object before updating
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { vehicles, ...orderWithoutRelations } = order;

    const updatedData = {
      ...orderWithoutRelations,
      ...data
    };

    updateJobOrder
      .mutateAsync({
        id: orderId,
        updates: updatedData
      })
      .catch((error) => {
        console.error('Error completing repair:', error);
      });
  };

  const tableData = data;

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
                  <TableHead>Repair Type</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.data && data.data.length > 0 ? (
                  data.data.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>
                        <StatusBadge status={order.status || 'pending'} />
                      </TableCell>
                      <TableCell>
                        {new Date(order.incident_date).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {getDriverName(order.assigned_mechanic)}
                      </TableCell>
                      <TableCell>
                        {order.target_date
                          ? new Date(order.target_date).toLocaleDateString()
                          : 'Not set'}
                      </TableCell>
                      <TableCell>
                        {order.repair_done
                          ? order.repair_done.charAt(0).toUpperCase() +
                            order.repair_done.slice(1)
                          : 'N/A'}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {isAdmin && order.status === 'pending' && (
                            <NoteJobOrderModal
                              drivers={drivers?.data}
                              onSubmit={(data) =>
                                handleNoteJobOrder(order.id, data)
                              }
                              isLoading={updateJobOrder.isPending}
                            />
                          )}
                          {isEVP && order.status === 'assigned_mechanic' && (
                            <ApproveJobOrderModal
                              onSubmit={(data) =>
                                handleApproveJobOrder(order.id, data)
                              }
                              isLoading={updateJobOrder.isPending}
                            />
                          )}
                          {isAdmin && order.status === 'ongoing_repair' && (
                            <CompleteRepairModal
                              onSubmit={(data) =>
                                handleCompleteRepair(order.id, data)
                              }
                              isLoading={updateJobOrder.isPending}
                            />
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              navigate({ to: `/job-order/${order.id}` })
                            }
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-muted-foreground py-8 text-center"
                    >
                      No data found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default JobOrdersPage;
