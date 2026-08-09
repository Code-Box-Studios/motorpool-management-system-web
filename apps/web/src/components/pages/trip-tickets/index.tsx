import StatusBadge from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
import { useTripTickets, useAllTripTickets } from '@/lib/query/trip-tickets';
import { useAllVehicles } from '@/lib/query/vehicles';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { useUserRole } from '@/hooks/use-user-role';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent } from '@/components/ui/card';
import PageHeader from '@/components/shared/page-header';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { AddTripTicket } from './add-trip-ticket/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import SortableTableHead from '@/components/shared/sortable-table-head';
import { useListControls } from '@/hooks/use-list-controls';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { TableSkeleton } from '@/components/shared/skeleton/table-skeleton';
import EmptyState from '@/components/shared/empty-state';
import TablePagination from '@/components/shared/table-pagination';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventClickArg } from '@fullcalendar/core';
import { useEffect, useMemo, useState } from 'react';
import {
  useApproveTripTicket,
  useDisapproveTripTicket,
  useCancelTripTicket
} from '@/lib/mutation/trip-tickets';
import { ChevronDown } from 'lucide-react';
import { TRIP_TICKET_STATUS } from '@/lib/enums';
import { formatRef } from '@/lib/utils/reference';
import { statusEventColor, resolveStatus } from '@/lib/status';
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

// shadcn paints the ACTIVE tab with --background — a canvas beige that sits
// *lighter* than the --muted track behind the inactive one, so on a white card
// the segmented control read inverted, the unselected view looking selected.
// Emphasis is the ink pill this app already uses for the primary button and the
// active sidebar item.
const ACTIVE_TAB =
  'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground dark:data-[state=active]:bg-primary dark:data-[state=active]:text-primary-foreground dark:data-[state=active]:border-primary';

type StatusAction = {
  label: string;
  destructive?: boolean;
  onSelect: () => void;
};

type TicketRow = {
  id: string;
  status?: string | null;
  start_ts?: string | null;
  destination?: string | null;
  purpose?: string | null;
  vehicle_id?: string | null;
};

// Status and the actions that change it are one control at the end of the row:
// the badge itself is the menu trigger, growing a chevron when a transition is
// legal for this viewer. The old control was a Select of status *names*, which
// promised "set any status" and then disabled most of them — and "Pending
// Fuel" as a menu entry hid that picking it means approving. The menu items
// come from the callers, which mirror the API's allowed-from sets
// (transitions.ts), so it only ever offers what the server would accept. When
// nothing is legal it is the plain badge, not a dead control.
function StatusMenu({
  status,
  busy,
  actions
}: {
  status: string;
  busy: boolean;
  actions: StatusAction[];
}) {
  // Every pill in the column shares one width so the table edge stays flush,
  // whether or not a row has a menu.
  const PILL_WIDTH = 'w-36';

  if (actions.length === 0)
    return <StatusBadge status={status} className={PILL_WIDTH} />;

  const { tone, label } = resolveStatus(status);

  return (
    // Only the menu swallows clicks — a menu-less cell still opens the record
    // like every other cell in the row. The wrapper sits in the React tree
    // above the portaled menu content, so item clicks are caught here too.
    <span onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {/* The pill itself is the trigger — same Badge recipe StatusBadge
              uses, rendered as a button so the chevron sits inside the
              status colour. The width goes on the Badge, not the button:
              Badge runs its classes through tailwind-merge, which is what
              drops the base `w-fit`; Slot's naive className join would keep
              both and let `w-fit` win. */}
          <Badge
            asChild
            variant={tone}
            className={`${PILL_WIDTH} cursor-pointer disabled:cursor-default disabled:opacity-50`}
          >
            <button type="button" disabled={busy} aria-label="Change status">
              {label}
              <ChevronDown />
            </button>
          </Badge>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {actions.map((action) => (
            <DropdownMenuItem
              key={action.label}
              variant={action.destructive ? 'destructive' : 'default'}
              onSelect={action.onSelect}
            >
              {action.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}

const TripTicketsPage = () => {
  const { user } = useAuth();
  const { data: userRole } = useUserRole();

  // Check if user is admin or requester
  const isAdmin = userRole?.roles?.name?.toLowerCase() === 'admin';
  const isRequester = userRole?.roles?.name?.toLowerCase() === 'requester';

  // Filter by userId for requesters, by branchId for admins
  const filterUserId = isRequester ? user?.id : undefined;
  const filterBranchId = isAdmin ? userRole?.branch_id : undefined;

  const { page, sort, setPage, handleSort } = useListControls();
  const limit = 10;
  const { data: tableData, isLoading: isTableLoading } = useTripTickets(
    page,
    limit,
    filterUserId,
    filterBranchId,
    undefined,
    sort ?? undefined
  );
  const totalPages = Math.ceil((tableData?.count || 0) / limit);

  // The role-derived filters resolve async — if they land after the user has
  // already paged, the dataset changed underneath them, so snap back to page 1.
  useEffect(() => {
    setPage(1);
  }, [filterUserId, filterBranchId, setPage]);
  const { data: calendarData, isLoading: isCalendarLoading } =
    useAllTripTickets(filterUserId, filterBranchId);
  const { data: vehiclesData } = useAllVehicles();
  const navigate = useNavigate();
  const approveTripTicket = useApproveTripTicket();
  const disapproveTripTicket = useDisapproveTripTicket();
  const cancelTripTicket = useCancelTripTicket();
  const [createOpen, setCreateOpen] = useState(false);
  const [createDate, setCreateDate] = useState<string | undefined>(undefined);
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

  // One opener per admin transition. Each seeds the same dialog state the old
  // status dropdown used, so the three dialogs below stay unchanged.
  const openApproveDialog = (ticket: TicketRow) => {
    setPendingStatusChange({
      ticketId: ticket.id,
      status: TRIP_TICKET_STATUS.PENDING_FUEL_ALLOCATION_APPROVAL
    });
    // Fall back to today when the ticket has no start_ts, so the required
    // approve `date` is never sent empty (server rejects '').
    const startDate = ticket.start_ts
      ? ticket.start_ts.split('T')[0]
      : new Date().toISOString().split('T')[0];
    setFuelAllocationData({
      allocation_date: startDate,
      allocation_trip_to: ticket.destination || '',
      allocation_purpose: ticket.purpose || '',
      allocation_vehicle_id: ticket.vehicle_id || '',
      allocation_fuel_type: '',
      allocation_liters: ''
    });
    setFuelAllocationDialogOpen(true);
  };

  const openDisapproveDialog = (ticketId: string) => {
    setPendingStatusChange({
      ticketId,
      status: TRIP_TICKET_STATUS.DISAPPROVED
    });
    setDisapprovedDialogOpen(true);
  };

  const openAdminCancelDialog = (ticketId: string) => {
    setPendingStatusChange({
      ticketId,
      status: TRIP_TICKET_STATUS.CANCELLED
    });
    setAdminCancelDialogOpen(true);
  };

  // Menu items per row, mirroring the server's allowed-from sets
  // (transitions.ts) so the menu never offers a transition the API rejects.
  const adminActionsFor = (ticket: TicketRow): StatusAction[] => {
    const status = ticket.status || 'pending_admin_approval';
    const actions: StatusAction[] = [];
    if (status === TRIP_TICKET_STATUS.PENDING_ADMIN_APPROVAL) {
      actions.push({
        label: 'Approve and allocate fuel',
        onSelect: () => openApproveDialog(ticket)
      });
    }
    if (
      status === TRIP_TICKET_STATUS.PENDING_ADMIN_APPROVAL ||
      status === TRIP_TICKET_STATUS.PENDING_FUEL_ALLOCATION_APPROVAL
    ) {
      // A normal decision in the approval chain, not a destructive one — red
      // is reserved for cancel, which discards the request outright.
      actions.push({
        label: 'Disapprove trip ticket',
        onSelect: () => openDisapproveDialog(ticket.id)
      });
    }
    if (
      status === TRIP_TICKET_STATUS.PENDING_ADMIN_APPROVAL ||
      status === TRIP_TICKET_STATUS.PENDING_FUEL_ALLOCATION_APPROVAL ||
      status === TRIP_TICKET_STATUS.APPROVED
    ) {
      actions.push({
        label: 'Cancel trip ticket',
        destructive: true,
        onSelect: () => openAdminCancelDialog(ticket.id)
      });
    }
    return actions;
  };

  // Same allowed-from set as the server's cancel(): both pending states and
  // `approved` — a signed-off trip that is no longer needed must stay
  // cancellable by its owner.
  const requesterActionsFor = (ticket: TicketRow): StatusAction[] => {
    const status = ticket.status || 'pending_admin_approval';
    const cancellable =
      status === TRIP_TICKET_STATUS.PENDING_ADMIN_APPROVAL ||
      status === TRIP_TICKET_STATUS.PENDING_FUEL_ALLOCATION_APPROVAL ||
      status === TRIP_TICKET_STATUS.APPROVED;
    if (!cancellable) return [];
    return [
      {
        label: 'Cancel trip ticket',
        destructive: true,
        onSelect: () => {
          setCancellingTicketId(ticket.id);
          setCancellationReason('');
        }
      }
    ];
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
        title: `${ticket.destination} — ${resolveStatus(ticket.status ?? '').label}`,
        start: startDateTime.toISOString(),
        end: endDateTime.toISOString(),
        backgroundColor: statusEventColor(ticket.status || 'pending'),
        borderColor: statusEventColor(ticket.status || 'pending'),
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

  // Creating a trip is a dialog, not a page: it is a form you fill and dismiss,
  // not a place you navigate to and have to find your way back from.
  const handleDateClick = (arg: { dateStr: string }) => {
    setCreateDate(arg.dateStr);
    setCreateOpen(true);
  };

  // Non-admins land on the detail page read-only. Shared by the row click and
  // the View button so the two can never drift apart.
  const openTicket = (ticketId: string) => {
    if (isAdmin) {
      navigate({ to: `/trip-tickets/${ticketId}` });
      return;
    }
    navigate({
      to: `/trip-tickets/${ticketId}`,
      search: { viewOnly: true }
    });
  };

  return (
    <div>
      <PageHeader
        title="Trip Tickets"
        description="Every requested trip and where it is in the approval chain."
        action={
          <Button
            onClick={() => {
              setCreateDate(undefined);
              setCreateOpen(true);
            }}
          >
            Create Trip Ticket
          </Button>
        }
      />

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setCreateDate(undefined);
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Request Trip Ticket</DialogTitle>
            <DialogDescription>
              Submit a trip ticket request for admin approval.
            </DialogDescription>
          </DialogHeader>
          {/* Remounted each time it opens, so a dismissed half-filled request is
              not still sitting there the next time someone starts one. */}
          <DialogBody>
            {createOpen && (
              <AddTripTicket
                key={createDate ?? 'new'}
                initialDate={createDate}
                onDone={() => {
                  setCreateOpen(false);
                  setCreateDate(undefined);
                }}
              />
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
      <Card>
        <CardContent className="pt-6">
          {/* The table is the operational view — it answers "what needs doing".
              The calendar is the secondary, planning view. */}
          <Tabs defaultValue="table" className="w-full">
            <TabsList className="grid w-full max-w-[260px] grid-cols-2">
              <TabsTrigger value="table" className={ACTIVE_TAB}>
                Table
              </TabsTrigger>
              <TabsTrigger value="calendar" className={ACTIVE_TAB}>
                Calendar
              </TabsTrigger>
            </TabsList>
            <TabsContent value="calendar" className="mt-6">
              {isCalendarLoading ? (
                <div className="text-muted-foreground py-12 text-center text-sm">
                  Loading calendar...
                </div>
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
                    { label: 'Ref', width: 'w-14' },
                    { label: 'Destination', width: 'w-40' },
                    { label: 'Purpose', width: 'w-48' },
                    { label: 'Pickup Date', width: 'w-20' },
                    { label: 'Return Date', width: 'w-20' },
                    { label: 'Status', width: 'w-32' }
                  ]}
                />
              ) : !tableData?.count ? (
                <EmptyState message="No trip tickets yet." />
              ) : (
                /* Table already renders its own overflow-x-auto container; the
                   min-width is what actually makes it scroll rather than letting
                   the browser squeeze the status control and the row actions
                   until they clip. */
                <>
                  <Table className="min-w-[1040px]">
                    <TableHeader>
                      <TableRow>
                        {/* sortKey values come from the API's
                            TRIP_TICKET_SORT_COLUMNS allowlist. */}
                        <SortableTableHead
                          label="Ref"
                          sortKey="ticketNo"
                          sort={sort}
                          onSort={handleSort}
                          className="w-[80px]"
                        />
                        <SortableTableHead
                          label="Destination"
                          sortKey="destination"
                          sort={sort}
                          onSort={handleSort}
                          className="min-w-[180px]"
                        />
                        <SortableTableHead
                          label="Purpose"
                          sortKey="purpose"
                          sort={sort}
                          onSort={handleSort}
                          className="min-w-[220px]"
                        />
                        <SortableTableHead
                          label="Pickup Date"
                          sortKey="startTs"
                          sort={sort}
                          onSort={handleSort}
                          className="w-[116px]"
                        />
                        <SortableTableHead
                          label="Return Date"
                          sortKey="endTs"
                          sort={sort}
                          onSort={handleSort}
                          className="w-[116px]"
                        />
                        {/* Status reads at the end of the row, with whatever can
                            change it right beside it — the requester's Cancel or
                            the admin's ⋯ menu. The row itself opens the ticket,
                            so there is no View button. */}
                        <SortableTableHead
                          label="Status"
                          sortKey="status"
                          sort={sort}
                          onSort={handleSort}
                          className="w-[200px] text-right"
                        />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tableData?.data?.map((ticket) => (
                        <TableRow
                          key={ticket.id}
                          className="cursor-pointer"
                          onClick={() => openTicket(ticket.id)}
                        >
                          <TableCell className="text-ink-soft font-mono text-sm whitespace-nowrap">
                            {formatRef('TT', ticket.ticket_no)}
                          </TableCell>
                          <TableCell className="max-w-[220px] truncate">
                            {ticket.destination}
                          </TableCell>
                          <TableCell className="text-muted-foreground max-w-xs truncate">
                            {ticket.purpose}
                          </TableCell>
                          <TableCell>
                            {ticket.start_ts ? (
                              new Date(ticket.start_ts).toLocaleDateString()
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {ticket.end_ts ? (
                              new Date(ticket.end_ts).toLocaleDateString()
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end">
                              <StatusMenu
                                status={ticket.status || 'pending'}
                                busy={
                                  approveTripTicket.isPending ||
                                  disapproveTripTicket.isPending ||
                                  cancelTripTicket.isPending
                                }
                                actions={
                                  isAdmin
                                    ? adminActionsFor(ticket)
                                    : requesterActionsFor(ticket)
                                }
                              />
                            </div>
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
                </>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Requester Cancellation Dialog — one page-level instance driven by
          cancellingTicketId, like the admin dialogs below. */}
      <AlertDialog
        open={cancellingTicketId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCancellingTicketId(null);
            setCancellationReason('');
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Trip Ticket</AlertDialogTitle>
            <AlertDialogDescription>
              Please provide a reason for cancelling this trip ticket request.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="cancellation-reason" className="mb-2 block">
              Cancellation Reason *
            </Label>
            <Textarea
              id="cancellation-reason"
              placeholder="Enter reason for cancellation..."
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              rows={4}
              className="w-full"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>No, keep it</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                !cancellationReason.trim() || cancelTripTicket.isPending
              }
              onClick={() => {
                if (cancellingTicketId && cancellationReason.trim()) {
                  handleStatusChange(
                    cancellingTicketId,
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
              disabled={
                !disapprovedReason.trim() || disapproveTripTicket.isPending
              }
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

export default TripTicketsPage;
