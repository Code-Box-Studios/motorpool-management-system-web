import StatusBadge from '@/components/shared/status-badge';
import { useTripTickets, useAllTripTickets } from '@/lib/query/trip-tickets';
import { useAllVehicles } from '@/lib/query/vehicles';
import { Link, useNavigate } from '@tanstack/react-router';
import { Button, buttonVariants } from '@/components/ui/button';
import { useUserRole } from '@/hooks/use-user-role';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { TableSkeleton } from '@/components/shared/skeleton/table-skeleton';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventClickArg } from '@fullcalendar/core';
import { useMemo, useState } from 'react';
import {
  useApproveTripTicket,
  useDisapproveTripTicket,
  useCancelTripTicket
} from '@/lib/mutation/trip-tickets';
import { Eye, X } from 'lucide-react';
import { TRIP_TICKET_STATUS } from '@/lib/enums';
import { formatRef } from '@/lib/utils/reference';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';

const TripTicketsPage = () => {
  const { user } = useAuth();
  const { data: userRole } = useUserRole();

  // Check if user is admin or requester
  const isAdmin = userRole?.roles?.name?.toLowerCase() === 'admin';
  const isRequester = userRole?.roles?.name?.toLowerCase() === 'requester';

  // Filter by userId for requesters, by branchId for admins
  const filterUserId = isRequester ? user?.id : undefined;
  const filterBranchId = isAdmin ? userRole?.branch_id : undefined;

  const { data: tableData, isLoading: isTableLoading } = useTripTickets(
    1,
    100,
    filterUserId,
    filterBranchId
  );
  const { data: calendarData, isLoading: isCalendarLoading } =
    useAllTripTickets(filterUserId, filterBranchId);
  const { data: vehiclesData } = useAllVehicles();
  const navigate = useNavigate();
  const approveTripTicket = useApproveTripTicket();
  const disapproveTripTicket = useDisapproveTripTicket();
  const cancelTripTicket = useCancelTripTicket();
  const [cancellationReason, setCancellationReason] = useState('');
  const [disapprovedReason, setDisapprovedReason] = useState('');
  const [cancellingTicketId, setCancellingTicketId] = useState<string | null>(
    null
  );
  const [adminCancelDialogOpen, setAdminCancelDialogOpen] = useState(false);
  const [disapprovedDialogOpen, setDisapprovedDialogOpen] = useState(false);
  const [fuelAllocationDialogOpen, setFuelAllocationDialogOpen] =
    useState(false);
  const [fuelAllocationData, setFuelAllocationData] = useState({
    allocation_date: '',
    allocation_trip_to: '',
    allocation_purpose: '',
    allocation_vehicle_id: '',
    allocation_fuel_type: '',
    allocation_liters: ''
  });
  const [pendingStatusChange, setPendingStatusChange] = useState<{
    ticketId: string;
    status: string;
  } | null>(null);

  // Shared cleanup for the three status-change dialogs below (fuel allocation,
  // disapproval, cancellation) once their transition mutation succeeds.
  const resetStatusChangeDialogs = () => {
    setCancellationReason('');
    setDisapprovedReason('');
    setCancellingTicketId(null);
    setFuelAllocationData({
      allocation_date: '',
      allocation_trip_to: '',
      allocation_purpose: '',
      allocation_vehicle_id: '',
      allocation_fuel_type: '',
      allocation_liters: ''
    });
  };

  // Routes an admin status change to the matching transition mutation — the
  // trip ticket status is no longer PATCH-able (§8), each transition is its
  // own endpoint.
  const handleStatusChange = (
    ticketId: string,
    newStatus: string,
    reason?: string,
    fuelData?: Record<string, string>
  ) => {
    if (newStatus === TRIP_TICKET_STATUS.CANCELLED && reason) {
      cancelTripTicket.mutate(
        { id: ticketId, reason },
        { onSuccess: resetStatusChangeDialogs }
      );
      return;
    }
    if (newStatus === TRIP_TICKET_STATUS.DISAPPROVED && reason) {
      disapproveTripTicket.mutate(
        { id: ticketId, reason },
        { onSuccess: resetStatusChangeDialogs }
      );
      return;
    }
    if (
      newStatus === TRIP_TICKET_STATUS.PENDING_FUEL_ALLOCATION_APPROVAL &&
      fuelData
    ) {
      approveTripTicket.mutate(
        {
          id: ticketId,
          liters: Number(fuelData.allocation_liters),
          fuelType: fuelData.allocation_fuel_type,
          date: fuelData.allocation_date,
          purpose: fuelData.allocation_purpose,
          tripTo: fuelData.allocation_trip_to
        },
        { onSuccess: resetStatusChangeDialogs }
      );
    }
  };

  const calendarEvents = useMemo(() => {
    if (!calendarData) return [];
    return calendarData.map((ticket) => {
      const startDateTime = new Date(ticket.start_ts || new Date());
      const endDateTime = new Date(ticket.end_ts || new Date());
      if (!ticket.end_ts) {
        endDateTime.setHours(23, 59, 59, 999);
      }

      return {
        id: ticket.id,
        title: `${ticket.destination} - ${ticket.status}`,
        start: startDateTime.toISOString(),
        end: endDateTime.toISOString(),
        backgroundColor: getStatusColor(ticket.status || 'pending'),
        borderColor: getStatusColor(ticket.status || 'pending'),
        extendedProps: {
          purpose: ticket.purpose,
          status: ticket.status
        }
      };
    });
  }, [calendarData]);

  const handleEventClick = (clickInfo: EventClickArg) => {
    navigate({ to: `/trip-tickets/${clickInfo.event.id}` });
  };

  const handleDateClick = (arg: { dateStr: string }) => {
    navigate({
      to: '/trip-tickets/add-trip-ticket',
      search: { date: arg.dateStr }
    });
  };

  return (
    <div>
      <Card>
        <CardHeader>
          <CardTitle>Trip Tickets</CardTitle>
          <CardDescription>Manage and view trip tickets.</CardDescription>
          <CardAction>
            <Link
              to="/trip-tickets/add-trip-ticket"
              className={cn(buttonVariants())}
            >
              Create Trip Ticket
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent>
          {/* The table is the operational view — it answers "what needs doing".
              The calendar is the secondary, planning view. */}
          <Tabs defaultValue="table" className="w-full">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="table">Table</TabsTrigger>
              <TabsTrigger value="calendar">Calendar</TabsTrigger>
            </TabsList>
            <TabsContent value="calendar" className="mt-6">
              {isCalendarLoading ? (
                <div>Loading calendar...</div>
              ) : (
                <FullCalendar
                  plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                  initialView="dayGridMonth"
                  headerToolbar={{
                    left: 'prev,next today',
                    center: 'title',
                    right: 'dayGridMonth,timeGridWeek,timeGridDay'
                  }}
                  events={calendarEvents}
                  eventClick={handleEventClick}
                  dateClick={handleDateClick}
                  height="auto"
                  editable={false}
                  selectable={true}
                />
              )}
            </TabsContent>
            <TabsContent value="table" className="mt-6">
              {isTableLoading ? (
                <TableSkeleton
                  columns={[
                    { label: 'Ref', width: 'w-16' },
                    { label: 'Status', width: 'w-28' },
                    { label: 'Destination', width: 'w-40' },
                    { label: 'Purpose', width: 'w-32' },
                    { label: 'Pickup Date', width: 'w-24' },
                    { label: 'Return Date', width: 'w-24' },
                    { label: 'Actions', width: 'w-10' }
                  ]}
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ref</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Destination</TableHead>
                      <TableHead>Purpose</TableHead>
                      <TableHead>Pickup Date</TableHead>
                      <TableHead>Return Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tableData?.data && tableData.data.length > 0 ? (
                      tableData.data.map((ticket) => (
                        <TableRow key={ticket.id}>
                          <TableCell className="text-ink-soft font-mono text-sm whitespace-nowrap">
                            {formatRef('TT', ticket.ticket_no)}
                          </TableCell>
                          <TableCell>
                            {isAdmin ? (
                              <Select
                                value={
                                  ticket.status || 'pending_admin_approval'
                                }
                                onValueChange={(value) => {
                                  if (value === TRIP_TICKET_STATUS.CANCELLED) {
                                    setPendingStatusChange({
                                      ticketId: ticket.id,
                                      status: value
                                    });
                                    setAdminCancelDialogOpen(true);
                                  } else if (
                                    value === TRIP_TICKET_STATUS.DISAPPROVED
                                  ) {
                                    setPendingStatusChange({
                                      ticketId: ticket.id,
                                      status: value
                                    });
                                    setDisapprovedDialogOpen(true);
                                  } else if (
                                    value ===
                                    TRIP_TICKET_STATUS.PENDING_FUEL_ALLOCATION_APPROVAL
                                  ) {
                                    setPendingStatusChange({
                                      ticketId: ticket.id,
                                      status: value
                                    });
                                    // Pre-populate fuel allocation data from ticket
                                    // Fall back to today when the ticket has no
                                    // start_ts, so the required approve `date`
                                    // is never sent empty (server rejects '').
                                    const startDate = ticket.start_ts
                                      ? ticket.start_ts.split('T')[0]
                                      : new Date().toISOString().split('T')[0];
                                    setFuelAllocationData({
                                      allocation_date: startDate,
                                      allocation_trip_to:
                                        ticket.destination || '',
                                      allocation_purpose: ticket.purpose || '',
                                      allocation_vehicle_id:
                                        ticket.vehicle_id || '',
                                      allocation_fuel_type: '',
                                      allocation_liters: ''
                                    });
                                    setFuelAllocationDialogOpen(true);
                                  } else {
                                    handleStatusChange(ticket.id, value);
                                  }
                                }}
                                disabled={
                                  approveTripTicket.isPending ||
                                  disapproveTripTicket.isPending ||
                                  cancelTripTicket.isPending ||
                                  ticket.status ===
                                    TRIP_TICKET_STATUS.CANCELLED ||
                                  ticket.status ===
                                    TRIP_TICKET_STATUS.APPROVED ||
                                  ticket.status ===
                                    TRIP_TICKET_STATUS.DISAPPROVED ||
                                  ticket.status ===
                                    TRIP_TICKET_STATUS.COMPLETED ||
                                  ticket.status ===
                                    TRIP_TICKET_STATUS.IN_PROGRESS
                                }
                              >
                                <SelectTrigger className="w-[180px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem
                                    value={
                                      TRIP_TICKET_STATUS.PENDING_ADMIN_APPROVAL
                                    }
                                    disabled
                                  >
                                    Pending Admin
                                  </SelectItem>
                                  <SelectItem
                                    value={
                                      TRIP_TICKET_STATUS.PENDING_FUEL_ALLOCATION_APPROVAL
                                    }
                                  >
                                    Pending Fuel
                                  </SelectItem>
                                  <SelectItem
                                    value={TRIP_TICKET_STATUS.APPROVED}
                                    disabled
                                  >
                                    Approved
                                  </SelectItem>
                                  <SelectItem
                                    value={TRIP_TICKET_STATUS.IN_PROGRESS}
                                    disabled
                                  >
                                    In Progress
                                  </SelectItem>
                                  <SelectItem
                                    value={TRIP_TICKET_STATUS.COMPLETED}
                                    disabled
                                  >
                                    Completed
                                  </SelectItem>
                                  <SelectItem
                                    value={TRIP_TICKET_STATUS.DISAPPROVED}
                                  >
                                    Disapproved
                                  </SelectItem>
                                  <SelectItem
                                    value={TRIP_TICKET_STATUS.CANCELLED}
                                  >
                                    Cancelled
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <StatusBadge status={ticket.status || 'pending'} />
                            )}
                          </TableCell>
                          <TableCell>{ticket.destination}</TableCell>
                          <TableCell className="max-w-xs truncate">
                            {ticket.purpose}
                          </TableCell>
                          <TableCell>
                            {ticket.start_ts
                              ? new Date(ticket.start_ts).toLocaleDateString()
                              : 'N/A'}
                          </TableCell>
                          <TableCell>
                            {ticket.end_ts
                              ? new Date(ticket.end_ts).toLocaleDateString()
                              : 'N/A'}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {isAdmin ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() =>
                                    navigate({
                                      to: `/trip-tickets/${ticket.id}`
                                    })
                                  }
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              ) : (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() =>
                                      navigate({
                                        to: `/trip-tickets/${ticket.id}`,
                                        search: { viewOnly: true }
                                      })
                                    }
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <AlertDialog
                                    open={cancellingTicketId === ticket.id}
                                    onOpenChange={(open) => {
                                      if (open) {
                                        setCancellingTicketId(ticket.id);
                                        setCancellationReason('');
                                      } else {
                                        setCancellingTicketId(null);
                                        setCancellationReason('');
                                      }
                                    }}
                                  >
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        disabled={
                                          cancelTripTicket.isPending ||
                                          ticket.status ===
                                            TRIP_TICKET_STATUS.CANCELLED ||
                                          ticket.status ===
                                            TRIP_TICKET_STATUS.APPROVED ||
                                          ticket.status ===
                                            TRIP_TICKET_STATUS.DISAPPROVED ||
                                          ticket.status ===
                                            TRIP_TICKET_STATUS.IN_PROGRESS ||
                                          ticket.status ===
                                            TRIP_TICKET_STATUS.COMPLETED
                                        }
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>
                                          Cancel Trip Ticket
                                        </AlertDialogTitle>
                                        <AlertDialogDescription>
                                          Please provide a reason for cancelling
                                          this trip ticket request.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <div className="py-4">
                                        <Label
                                          htmlFor="cancellation-reason"
                                          className="mb-2 block"
                                        >
                                          Cancellation Reason *
                                        </Label>
                                        <Textarea
                                          id="cancellation-reason"
                                          placeholder="Enter reason for cancellation..."
                                          value={cancellationReason}
                                          onChange={(e) =>
                                            setCancellationReason(
                                              e.target.value
                                            )
                                          }
                                          rows={4}
                                          className="w-full"
                                        />
                                      </div>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>
                                          No, keep it
                                        </AlertDialogCancel>
                                        <AlertDialogAction
                                          disabled={
                                            !cancellationReason.trim() ||
                                            cancelTripTicket.isPending
                                          }
                                          onClick={() => {
                                            if (cancellationReason.trim()) {
                                              handleStatusChange(
                                                ticket.id,
                                                TRIP_TICKET_STATUS.CANCELLED,
                                                cancellationReason
                                              );
                                            }
                                          }}
                                        >
                                          Yes, cancel request
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="text-muted-foreground py-8 text-center"
                        >
                          No data found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Admin Cancellation Dialog */}
      <AlertDialog
        open={adminCancelDialogOpen}
        onOpenChange={(open) => {
          setAdminCancelDialogOpen(open);
          if (!open) {
            setPendingStatusChange(null);
            setCancellationReason('');
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Trip Ticket</AlertDialogTitle>
            <AlertDialogDescription>
              Please provide a reason for cancelling this trip ticket.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="admin-cancellation-reason" className="mb-2 block">
              Cancellation Reason *
            </Label>
            <Textarea
              id="admin-cancellation-reason"
              placeholder="Enter reason for cancellation..."
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              rows={4}
              className="w-full"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                !cancellationReason.trim() || cancelTripTicket.isPending
              }
              onClick={() => {
                if (pendingStatusChange && cancellationReason.trim()) {
                  handleStatusChange(
                    pendingStatusChange.ticketId,
                    pendingStatusChange.status,
                    cancellationReason
                  );
                  setAdminCancelDialogOpen(false);
                }
              }}
            >
              Confirm Cancellation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Disapproved Reason Dialog */}
      <AlertDialog
        open={disapprovedDialogOpen}
        onOpenChange={(open) => {
          setDisapprovedDialogOpen(open);
          if (!open) {
            setPendingStatusChange(null);
            setDisapprovedReason('');
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disapprove Trip Ticket</AlertDialogTitle>
            <AlertDialogDescription>
              Please provide a reason for disapproving this trip ticket.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="disapproved-reason" className="mb-2 block">
              Disapproved Reason *
            </Label>
            <Textarea
              id="disapproved-reason"
              placeholder="Enter reason for disapproval"
              value={disapprovedReason}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setDisapprovedReason(e.target.value)
              }
              rows={4}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!disapprovedReason.trim() || disapproveTripTicket.isPending}
              onClick={() => {
                if (pendingStatusChange && disapprovedReason.trim()) {
                  handleStatusChange(
                    pendingStatusChange.ticketId,
                    pendingStatusChange.status,
                    disapprovedReason
                  );
                  setDisapprovedDialogOpen(false);
                }
              }}
            >
              Confirm Disapproval
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Fuel Allocation Dialog */}
      <AlertDialog
        open={fuelAllocationDialogOpen}
        onOpenChange={(open) => {
          setFuelAllocationDialogOpen(open);
          if (!open) {
            setPendingStatusChange(null);
            setFuelAllocationData({
              allocation_date: '',
              allocation_trip_to: '',
              allocation_purpose: '',
              allocation_vehicle_id: '',
              allocation_fuel_type: '',
              allocation_liters: ''
            });
          }
        }}
      >
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Fuel Allocation Details</AlertDialogTitle>
            <AlertDialogDescription>
              Please provide fuel allocation details to submit for EVP
              Operations approval.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="fuel-allocation-date" className="mb-2 block">
                  Allocation Date *
                </Label>
                <Input
                  id="fuel-allocation-date"
                  type="date"
                  value={fuelAllocationData.allocation_date}
                  disabled
                  className="bg-muted"
                />
              </div>
              <div>
                <Label htmlFor="fuel-allocation-trip-to" className="mb-2 block">
                  Trip To *
                </Label>
                <Input
                  id="fuel-allocation-trip-to"
                  type="text"
                  value={fuelAllocationData.allocation_trip_to}
                  disabled
                  className="bg-muted"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="fuel-allocation-purpose" className="mb-2 block">
                Purpose *
              </Label>
              <Textarea
                id="fuel-allocation-purpose"
                value={fuelAllocationData.allocation_purpose}
                disabled
                className="bg-muted"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="fuel-allocation-vehicle" className="mb-2 block">
                  Vehicle *
                </Label>
                <Input
                  id="fuel-allocation-vehicle"
                  type="text"
                  value={(() => {
                    const vehicle = vehiclesData?.find(
                      (v) => v.id === fuelAllocationData.allocation_vehicle_id
                    );
                    return vehicle
                      ? `${vehicle.make} ${vehicle.model} (${vehicle.license_plate})`
                      : fuelAllocationData.allocation_vehicle_id;
                  })()}
                  disabled
                  className="bg-muted"
                />
              </div>
              <div>
                <Label htmlFor="fuel-allocation-type" className="mb-2 block">
                  Fuel Type *
                </Label>
                <Select
                  value={fuelAllocationData.allocation_fuel_type}
                  onValueChange={(value) =>
                    setFuelAllocationData((prev) => ({
                      ...prev,
                      allocation_fuel_type: value
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select fuel type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gasoline">Gasoline</SelectItem>
                    <SelectItem value="diesel">Diesel</SelectItem>
                    <SelectItem value="electric">Electric</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="fuel-allocation-liters" className="mb-2 block">
                Liters Required *
              </Label>
              <Input
                id="fuel-allocation-liters"
                type="number"
                min="0"
                step="0.01"
                value={fuelAllocationData.allocation_liters}
                onChange={(e) =>
                  setFuelAllocationData((prev) => ({
                    ...prev,
                    allocation_liters: e.target.value
                  }))
                }
                placeholder="Enter liters required"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                !fuelAllocationData.allocation_fuel_type ||
                !(Number(fuelAllocationData.allocation_liters) > 0) ||
                approveTripTicket.isPending
              }
              onClick={() => {
                if (pendingStatusChange) {
                  handleStatusChange(
                    pendingStatusChange.ticketId,
                    pendingStatusChange.status,
                    undefined,
                    fuelAllocationData
                  );
                  setFuelAllocationDialogOpen(false);
                }
              }}
            >
              Submit for Fuel Allocation Approval
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    pending_admin_approval: '#f59e0b',
    pending_fuel_allocation_approval: '#fb923c',
    approved: '#10b981',
    in_progress: '#3b82f6',
    completed: '#6b7280',
    disapproved: '#dc2626',
    cancelled: '#ef4444'
  };
  return colors[status] || '#6b7280';
}

export default TripTicketsPage;
