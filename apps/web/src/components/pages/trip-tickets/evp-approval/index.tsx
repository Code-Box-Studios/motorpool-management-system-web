import { useState } from 'react';
import { useTripTickets } from '@/lib/query/trip-tickets';
import {
  useApproveEvpTripTicket,
  useDisapproveTripTicket
} from '@/lib/mutation/trip-tickets';
import { useJobOrders } from '@/lib/query/job-orders';
import { useApproveJobOrder } from '@/lib/mutation/job-orders';
import { useDrivers } from '@/lib/query/drivers';
import {
  Card,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { TRIP_TICKET_STATUS, JOB_ORDER_STATUS } from '@/lib/enums';
import { TableSkeleton } from '@/components/shared/skeleton/table-skeleton';
import { CheckCircle, XCircle, Eye } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import StatusBadge from '@/components/shared/status-badge';
import { ApproveJobOrderModal } from '@/components/pages/job-order/job-order-inner/approve-job-order-modal';
import { ConfirmationModal } from '@/components/shared/confirmation-modal';

export default function EvpApprovalPage() {
  const approveEvpTripTicket = useApproveEvpTripTicket();
  const disapproveTripTicket = useDisapproveTripTicket();
  const approveJobOrder = useApproveJobOrder();
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'disapprove' | null>(
    null
  );
  const [disapprovedReason, setDisapprovedReason] = useState('');

  // Fetch all trip tickets (no branch filter for EVP)
  const { data: tripTicketsData, isLoading } = useTripTickets(1, 100);

  // Fetch job orders pending approval
  const { data: jobOrdersData, isLoading: jobOrdersLoading } = useJobOrders(
    1,
    100
  );

  // Fetch all drivers to lookup names
  const { data: driversData } = useDrivers(1, 1000);

  // Helper function to get driver name by ID
  const getDriverName = (driverId: string | null | undefined) => {
    if (!driverId) return 'Not assigned';
    const driver = driversData?.data?.find((d) => d.id === driverId);
    return driver?.full_name || driverId;
  };

  // Debug logging
  console.log('Drivers data:', driversData?.data);
  console.log('Job orders data:', jobOrdersData?.data);

  const handleApprove = (ticketId: string) => {
    setSelectedTicket(ticketId);
    setActionType('approve');
  };

  const handleDisapprove = (ticketId: string) => {
    setSelectedTicket(ticketId);
    setActionType('disapprove');
    setDisapprovedReason('');
  };

  const confirmApprove = () => {
    if (selectedTicket) {
      approveEvpTripTicket.mutate({ id: selectedTicket });
      setSelectedTicket(null);
      setActionType(null);
    }
  };

  const confirmDisapprove = () => {
    if (selectedTicket && disapprovedReason.trim()) {
      disapproveTripTicket.mutate({
        id: selectedTicket,
        reason: disapprovedReason
      });
      setSelectedTicket(null);
      setActionType(null);
      setDisapprovedReason('');
    }
  };

  // Filter for tickets pending fuel allocation approval
  const pendingApproval = tripTicketsData?.data?.filter(
    (ticket) =>
      ticket.status === TRIP_TICKET_STATUS.PENDING_FUEL_ALLOCATION_APPROVAL
  );

  // Filter for job orders pending approval (status: assigned_mechanic)
  const pendingJobOrders = jobOrdersData?.data?.filter(
    (order) => order.status === JOB_ORDER_STATUS.ASSIGNED_MECHANIC
  );

  const handleApproveJobOrder = (orderId: string) => {
    approveJobOrder.mutateAsync({ id: orderId }).catch((error) => {
      console.error('Error approving job order:', error);
    });
  };

  return (
    <div className="container mx-auto space-y-4 py-6">
      <Card>
        <CardHeader>
          <CardTitle>Trip Ticket Approval - EVP Operations</CardTitle>
          <CardDescription>
            Review and approve or disapprove trip tickets with fuel allocation
            requests from all branches.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingApproval && pendingApproval.length > 0 ? (
                  pendingApproval.map((ticket) => (
                    <TableRow key={ticket.id}>
                      <TableCell>
                        <StatusBadge status={ticket.status ?? ''} />
                      </TableCell>
                      <TableCell>{ticket.destination}</TableCell>
                      <TableCell className="max-w-xs truncate">
                        {ticket.allocation_purpose || ticket.purpose}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" asChild>
                            <Link
                              to="/trip-tickets/$id"
                              params={{ id: ticket.id }}
                            >
                              <Eye className="mr-1 h-4 w-4" />
                              View
                            </Link>
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleApprove(ticket.id)}
                            disabled={approveEvpTripTicket.isPending}
                          >
                            <CheckCircle className="mr-1 h-4 w-4" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDisapprove(ticket.id)}
                            disabled={disapproveTripTicket.isPending}
                          >
                            <XCircle className="mr-1 h-4 w-4" />
                            Disapprove
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-muted-foreground text-center"
                    >
                      No trip tickets pending approval
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Job Order Approval - EVP Operations</CardTitle>
          <CardDescription>
            Review and approve job orders with assigned mechanics from all
            branches.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {jobOrdersLoading ? (
            <TableSkeleton />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Incident Date</TableHead>
                  <TableHead>Assigned Mechanic</TableHead>
                  <TableHead>Target Date</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingJobOrders && pendingJobOrders.length > 0 ? (
                  pendingJobOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>
                        <StatusBadge status={order.status || 'pending'} />
                      </TableCell>
                      <TableCell>
                        {order.incident_date ? new Date(order.incident_date).toLocaleString() : 'N/A'}
                      </TableCell>
                      <TableCell>
                        {getDriverName(order.assigned_mechanic)}
                      </TableCell>
                      <TableCell>
                        {order.target_date
                          ? new Date(order.target_date).toLocaleString()
                          : 'Not set'}
                      </TableCell>
                      <TableCell>
                        {order.vehicles
                          ? `${order.vehicles.make} ${order.vehicles.model} - ${order.vehicles.license_plate}`
                          : 'N/A'}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" asChild>
                            <Link to="/job-order/$id" params={{ id: order.id }}>
                              <Eye className="mr-1 h-4 w-4" />
                              View
                            </Link>
                          </Button>
                          <ApproveJobOrderModal
                            onSubmit={() => handleApproveJobOrder(order.id)}
                            isLoading={approveJobOrder.isPending}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-muted-foreground text-center"
                    >
                      No job orders pending approval
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Approve Confirmation Dialog */}
      <ConfirmationModal
        open={actionType === 'approve'}
        onOpenChange={() => setActionType(null)}
        title="Approve Trip Ticket"
        description="Are you sure you want to approve this trip ticket? The requester will be notified and the ticket will proceed to the next stage."
        confirmLabel="Approve"
        loading={approveEvpTripTicket.isPending}
        onConfirm={confirmApprove}
        onCancel={() => {
          setSelectedTicket(null);
          setActionType(null);
        }}
      />

      {/* Disapprove Dialog */}
      <AlertDialog
        open={actionType === 'disapprove'}
        onOpenChange={() => setActionType(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disapprove Trip Ticket</AlertDialogTitle>
            <AlertDialogDescription>
              Please provide a reason for disapproving this trip ticket.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="disapproved_reason">Reason for Disapproval</Label>
            <Textarea
              id="disapproved_reason"
              value={disapprovedReason}
              onChange={(e) => setDisapprovedReason(e.target.value)}
              placeholder="Enter reason for disapproval..."
              className="mt-2"
              rows={4}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setActionType(null);
                setDisapprovedReason('');
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDisapprove}
              disabled={!disapprovedReason.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Disapprove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
