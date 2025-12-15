import { useState } from 'react';
import { useTripTickets } from '@/lib/query/trip-tickets';
import { useUpdateTripTicket } from '@/lib/mutation/trip-tickets';
import { useAuth } from '@/hooks/use-auth';
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
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { TRIP_TICKET_STATUS } from '@/lib/enums';
import { TableSkeleton } from '@/components/shared/skeleton/table-skeleton';
import { CheckCircle, XCircle, Eye } from 'lucide-react';
import { Link } from '@tanstack/react-router';

export default function EvpApprovalPage() {
  const { user } = useAuth();
  const updateTripTicket = useUpdateTripTicket();
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'disapprove' | null>(
    null
  );
  const [disapprovedReason, setDisapprovedReason] = useState('');

  // Fetch all trip tickets (no branch filter for EVP)
  const { data: tripTicketsData, isLoading } = useTripTickets(1, 100);

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
      updateTripTicket.mutate({
        id: selectedTicket,
        updates: {
          status: TRIP_TICKET_STATUS.APPROVED,
          allocation_approved_by_evp_operations: user?.id
        }
      });
      setSelectedTicket(null);
      setActionType(null);
    }
  };

  const confirmDisapprove = () => {
    if (selectedTicket && disapprovedReason.trim()) {
      updateTripTicket.mutate({
        id: selectedTicket,
        updates: {
          status: TRIP_TICKET_STATUS.DISAPPROVED,
          disapproved_reason: disapprovedReason
        }
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
                        <Badge variant="default" className="capitalize">
                          {ticket.status?.replace(/_/g, ' ')}
                        </Badge>
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
                            disabled={updateTripTicket.isPending}
                          >
                            <CheckCircle className="mr-1 h-4 w-4" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDisapprove(ticket.id)}
                            disabled={updateTripTicket.isPending}
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

      {/* Approve Confirmation Dialog */}
      <AlertDialog
        open={actionType === 'approve'}
        onOpenChange={() => setActionType(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve Trip Ticket</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to approve this trip ticket? The requester
              will be notified and the ticket will proceed to the next stage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setActionType(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmApprove}>
              Approve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
