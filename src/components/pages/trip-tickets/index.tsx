import { useTripTickets, useAllTripTickets } from '@/lib/query/trip-tickets';
import { Link, useNavigate } from '@tanstack/react-router';
import { Button, buttonVariants } from '@/components/ui/button';
import { useUserRole } from '@/hooks/use-user-role';
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
import { TableSkeleton } from '@/components/shared/skeleton/table-skeleton';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventClickArg } from '@fullcalendar/core';
import { useMemo } from 'react';
import {
  useDeleteTripTicket,
  useUpdateTripTicket
} from '@/lib/mutation/trip-tickets';
import { Pencil, Trash2, Eye, X } from 'lucide-react';
import { TRIP_TICKET_STATUS } from '@/lib/enums';
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
  const { data: tableData, isLoading: isTableLoading } = useTripTickets(1, 100);
  const { data: calendarData, isLoading: isCalendarLoading } =
    useAllTripTickets();
  const navigate = useNavigate();
  const deleteTripTicket = useDeleteTripTicket();
  const updateTripTicket = useUpdateTripTicket();
  const { data: userRole } = useUserRole();

  // Check if user is admin (can modify status and perform actions)
  const isAdmin = userRole?.roles?.name?.toLowerCase() === 'admin';

  const handleStatusChange = (ticketId: string, newStatus: string) => {
    updateTripTicket.mutate({
      id: ticketId,
      updates: { status: newStatus }
    });
  };

  const calendarEvents = useMemo(() => {
    if (!calendarData) return [];
    return calendarData.map((ticket) => {
      // Parse the start_ts and end_ts properly
      const startDateTime = new Date(ticket.start_ts || new Date());
      const endDateTime = new Date(ticket.end_ts || new Date());
      // Set end time to ensure it shows properly on calendar
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
          <Tabs defaultValue="calendar" className="w-full">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="calendar">Calendar</TabsTrigger>
              <TabsTrigger value="table">Table</TabsTrigger>
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
                <TableSkeleton />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
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
                          <TableCell>
                            {isAdmin ? (
                              <Select
                                value={
                                  ticket.status || 'pending_admin_approval'
                                }
                                onValueChange={(value) =>
                                  handleStatusChange(ticket.id, value)
                                }
                                disabled={updateTripTicket.isPending}
                              >
                                <SelectTrigger className="w-[180px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem
                                    value={
                                      TRIP_TICKET_STATUS.PENDING_ADMIN_APPROVAL
                                    }
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
                                  >
                                    Approved
                                  </SelectItem>
                                  <SelectItem
                                    value={TRIP_TICKET_STATUS.IN_PROGRESS}
                                  >
                                    In Progress
                                  </SelectItem>
                                  <SelectItem
                                    value={TRIP_TICKET_STATUS.COMPLETED}
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
                              <span className="text-sm capitalize">
                                {ticket.status?.replace(/_/g, ' ') || 'pending'}
                              </span>
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
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() =>
                                      navigate({
                                        to: `/trip-tickets/${ticket.id}`
                                      })
                                    }
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        disabled={deleteTripTicket.isPending}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>
                                          Are you sure?
                                        </AlertDialogTitle>
                                        <AlertDialogDescription>
                                          This action cannot be undone. This
                                          will permanently delete the trip
                                          ticket and remove the data from the
                                          server.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>
                                          Cancel
                                        </AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() =>
                                            deleteTripTicket.mutate(ticket.id)
                                          }
                                        >
                                          Delete
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </>
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
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        disabled={
                                          updateTripTicket.isPending ||
                                          ticket.status ===
                                            TRIP_TICKET_STATUS.CANCELLED
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
                                          Are you sure you want to cancel this
                                          trip ticket request?
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>
                                          No, keep it
                                        </AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() =>
                                            handleStatusChange(
                                              ticket.id,
                                              TRIP_TICKET_STATUS.CANCELLED
                                            )
                                          }
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
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
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
