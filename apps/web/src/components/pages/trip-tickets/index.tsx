import StatusBadge from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
import { useTripTickets, useAllTripTickets } from '@/lib/query/trip-tickets';
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
import { FuelAllocationDialog, ReasonDialog } from './transition-dialogs';
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
import { TableSkeleton } from '@/components/shared/skeleton/table-skeleton';
import EmptyState from '@/components/shared/empty-state';
import TablePagination from '@/components/shared/table-pagination';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventClickArg } from '@fullcalendar/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useApproveTripTicket,
  useDisapproveTripTicket,
  useCancelTripTicket
} from '@/lib/mutation/trip-tickets';
import { ChevronDown } from 'lucide-react';
import { TRIP_TICKET_STATUS } from '@/lib/enums';
import { formatRef } from '@/lib/utils/reference';
import { statusEventColor, resolveStatus } from '@/lib/status';

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

  // A requester only ever sees their own requests. An admin sees the WHOLE
  // fleet: this used to narrow the list to the admin's own branch, which hid
  // other branches' trips from the one role meant to oversee all of them —
  // and misleadingly so, since the admin could still open and approve those
  // same tickets by URL (the server scopes admins to everything).
  const filterUserId = isRequester ? user?.id : undefined;

  const { page, sort, setPage, handleSort } = useListControls();
  const limit = 10;
  const { data: tableData, isLoading: isTableLoading } = useTripTickets(
    page,
    limit,
    filterUserId,
    undefined,
    undefined,
    sort ?? undefined
  );
  const totalPages = Math.ceil((tableData?.count || 0) / limit);

  // The role-derived filter resolves async — if it CHANGES after the user has
  // already paged, the dataset moved underneath them, so snap back to page 1.
  // The ref is what keeps this from firing on mount: an unconditional reset
  // rewrote the URL on first render and threw away a shared /trip-tickets?page=3
  // link before the user ever saw it.
  const previousFilterUserId = useRef(filterUserId);
  useEffect(() => {
    if (previousFilterUserId.current === filterUserId) return;
    previousFilterUserId.current = filterUserId;
    setPage(1);
  }, [filterUserId, setPage]);
  const { data: calendarData, isLoading: isCalendarLoading } =
    useAllTripTickets(filterUserId, undefined);
  const navigate = useNavigate();
  const approveTripTicket = useApproveTripTicket();
  const disapproveTripTicket = useDisapproveTripTicket();
  const cancelTripTicket = useCancelTripTicket();
  const [createOpen, setCreateOpen] = useState(false);
  const [createDate, setCreateDate] = useState<string | undefined>(undefined);
  // Which ticket each dialog is open against. The dialogs collect their own
  // fields — the reason, the fuel type and the liters — and hand them back on
  // confirm, so the row is all the page itself has to remember.
  const [approvingTicket, setApprovingTicket] = useState<TicketRow | null>(
    null
  );
  const [disapprovingTicketId, setDisapprovingTicketId] = useState<
    string | null
  >(null);
  const [adminCancellingTicketId, setAdminCancellingTicketId] = useState<
    string | null
  >(null);
  const [cancellingTicketId, setCancellingTicketId] = useState<string | null>(
    null
  );

  // Menu items per row, mirroring the server's allowed-from sets
  // (transitions.ts) so the menu never offers a transition the API rejects.
  const adminActionsFor = (ticket: TicketRow): StatusAction[] => {
    const status = ticket.status || 'pending_admin_approval';
    const actions: StatusAction[] = [];
    if (status === TRIP_TICKET_STATUS.PENDING_ADMIN_APPROVAL) {
      actions.push({
        label: 'Approve and allocate fuel',
        onSelect: () => setApprovingTicket(ticket)
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
        onSelect: () => setDisapprovingTicketId(ticket.id)
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
        onSelect: () => setAdminCancellingTicketId(ticket.id)
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
        onSelect: () => setCancellingTicketId(ticket.id)
      }
    ];
  };

  const calendarEvents = useMemo(() => {
    if (!calendarData) return [];
    // One block per OUTING, not per ticket. A ticket spanning the 17th and the
    // 21st used to paint one bar straight through the 18th-20th, which is
    // exactly the availability lie this feature removes.
    return calendarData.flatMap((ticket) =>
      ticket.dates
        .filter((d) => d.status !== 'cancelled')
        .map((d) => {
          const startDateTime = new Date(d.start_ts);
          const endDateTime = new Date(d.end_ts);
          return {
            // Composite: `${ticketId}:${dateId}`. handleEventClick below splits
            // on ':' and takes the first segment — every other reader of this
            // id must do the same, or it navigates to a malformed route.
            id: `${ticket.id}:${d.id}`,
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
        })
    );
  }, [calendarData]);

  const handleEventClick = (clickInfo: EventClickArg) => {
    // The event id is composite (`${ticketId}:${dateId}`, see calendarEvents
    // above) — only the ticket id is a route param, so take the first segment.
    const [ticketId] = clickInfo.event.id.split(':');
    navigate({ to: `/trip-tickets/${ticketId}` });
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

      {/* Requester Cancellation — worded as a question about their own
          request, unlike the admin's decision below. */}
      <ReasonDialog
        open={cancellingTicketId !== null}
        onOpenChange={(open) => {
          if (!open) setCancellingTicketId(null);
        }}
        title="Cancel Trip Ticket"
        description="Please provide a reason for cancelling this trip ticket request."
        label="Cancellation Reason *"
        placeholder="Enter reason for cancellation..."
        cancelLabel="No, keep it"
        confirmLabel="Yes, cancel request"
        isLoading={cancelTripTicket.isPending}
        onConfirm={(reason) => {
          if (!cancellingTicketId) return;
          cancelTripTicket.mutate({ id: cancellingTicketId, reason });
        }}
      />

      {/* Admin Cancellation */}
      <ReasonDialog
        open={adminCancellingTicketId !== null}
        onOpenChange={(open) => {
          if (!open) setAdminCancellingTicketId(null);
        }}
        title="Cancel Trip Ticket"
        description="Please provide a reason for cancelling this trip ticket."
        label="Cancellation Reason *"
        placeholder="Enter reason for cancellation..."
        confirmLabel="Confirm Cancellation"
        isLoading={cancelTripTicket.isPending}
        onConfirm={(reason) => {
          if (!adminCancellingTicketId) return;
          cancelTripTicket.mutate({ id: adminCancellingTicketId, reason });
        }}
      />

      {/* Disapproved Reason */}
      <ReasonDialog
        open={disapprovingTicketId !== null}
        onOpenChange={(open) => {
          if (!open) setDisapprovingTicketId(null);
        }}
        title="Disapprove Trip Ticket"
        description="Please provide a reason for disapproving this trip ticket."
        label="Disapproved Reason *"
        placeholder="Enter reason for disapproval"
        confirmLabel="Confirm Disapproval"
        isLoading={disapproveTripTicket.isPending}
        onConfirm={(reason) => {
          if (!disapprovingTicketId) return;
          disapproveTripTicket.mutate({ id: disapprovingTicketId, reason });
        }}
      />

      {/* Fuel Allocation */}
      <FuelAllocationDialog
        open={approvingTicket !== null}
        ticket={approvingTicket}
        onOpenChange={(open) => {
          if (!open) setApprovingTicket(null);
        }}
        isLoading={approveTripTicket.isPending}
        onConfirm={(allocation) => {
          if (!approvingTicket) return;
          approveTripTicket.mutate({ id: approvingTicket.id, ...allocation });
        }}
      />
    </div>
  );
};

export default TripTicketsPage;
