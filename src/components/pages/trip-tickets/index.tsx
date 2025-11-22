import { useTripTickets, useAllTripTickets } from '@/lib/query/trip-tickets';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TableSkeleton } from '@/components/shared/skeleton/table-skeleton';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventClickArg } from '@fullcalendar/core';
import { useMemo } from 'react';
import { useDeleteTripTicket } from '@/lib/mutation/trip-tickets';
import { Pencil, Trash2 } from 'lucide-react';
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

  const calendarEvents = useMemo(() => {
    if (!calendarData) return [];
    return calendarData.map((ticket) => {
      // Parse the pickup_date_time and return_date properly
      const pickupDateTime = new Date(ticket.pickup_date_time);
      const returnDate = new Date(ticket.return_date);
      // Set return date to end of day to show full day on calendar
      returnDate.setHours(23, 59, 59, 999);

      return {
        id: ticket.id,
        title: `${ticket.destination} - ${ticket.status}`,
        start: pickupDateTime.toISOString(),
        end: returnDate.toISOString(),
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
                            <StatusBadge status={ticket.status || 'pending'} />
                          </TableCell>
                          <TableCell>{ticket.destination}</TableCell>
                          <TableCell className="max-w-xs truncate">
                            {ticket.purpose}
                          </TableCell>
                          <TableCell>
                            {new Date(
                              ticket.pickup_date_time
                            ).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            {new Date(ticket.return_date).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  navigate({ to: `/trip-tickets/${ticket.id}` })
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
                                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This action cannot be undone. This will permanently delete the trip ticket
                                      and remove the data from the server.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => deleteTripTicket.mutate(ticket.id)}
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
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
    pending: '#f59e0b',
    approved: '#10b981',
    'in-progress': '#3b82f6',
    completed: '#6b7280',
    cancelled: '#ef4444'
  };
  return colors[status] || '#6b7280';
}

export default TripTicketsPage;
