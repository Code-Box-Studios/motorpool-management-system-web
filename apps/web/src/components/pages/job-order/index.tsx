import { useJobOrders, useAllJobOrders } from '@/lib/query/job-orders';
import { Link, useNavigate } from '@tanstack/react-router';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import StatusBadge from '@/components/shared/status-badge';
import { formatRef } from '@/lib/utils/reference';
import { statusEventColor, resolveStatus } from '@/lib/status';
import { Card, CardContent } from '@/components/ui/card';
import PageHeader from '@/components/shared/page-header';
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
import EmptyState from '@/components/shared/empty-state';
import { NoteJobOrderModal } from './job-order-inner/note-job-order-modal';
import { ApproveJobOrderModal } from './job-order-inner/approve-job-order-modal';
import { CompleteRepairModal } from './job-order-inner/complete-repair-modal';
import { useAllDrivers } from '@/lib/query/drivers';
import {
  useNoteJobOrder,
  useApproveJobOrder,
  useCompleteRepair
} from '@/lib/mutation/job-orders';
import type { NoteJobOrderData } from './job-order-inner/note-job-order-modal';
import type { CompleteRepairData } from './job-order-inner/complete-repair-modal';
import { Eye } from 'lucide-react';
import { useUserRole } from '@/hooks/use-user-role';
import { useAuth } from '@/hooks/use-auth';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventClickArg } from '@fullcalendar/core';
import { useMemo } from 'react';

// shadcn paints the ACTIVE tab with --background — a canvas beige that sits
// *lighter* than the --muted track behind the inactive one, so on a white card
// the segmented control read inverted, the unselected view looking selected.
// Emphasis is the ink pill this app already uses for the primary button and the
// active sidebar item.
const ACTIVE_TAB =
  'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground dark:data-[state=active]:bg-primary dark:data-[state=active]:text-primary-foreground dark:data-[state=active]:border-primary';

const EmDash = () => <span className="text-muted-foreground">—</span>;

// Job orders carry a timestamp, not just a day. Stacking the time under the date
// keeps that precision without paying for a column wide enough to hold both on
// one line.
const DateTimeCell = ({ value }: { value: string | null | undefined }) => {
  if (!value) return <EmDash />;
  const at = new Date(value);
  return (
    <span className="flex flex-col leading-tight">
      <span>{at.toLocaleDateString()}</span>
      <span className="text-muted-foreground text-xs">
        {at.toLocaleTimeString()}
      </span>
    </span>
  );
};

const JobOrdersPage = () => {
  const { user } = useAuth();
  const { data: userRole } = useUserRole();
  const { data: drivers } = useAllDrivers();
  const noteJobOrder = useNoteJobOrder();
  const approveJobOrder = useApproveJobOrder();
  const completeRepair = useCompleteRepair();
  const navigate = useNavigate();

  const isAdmin = userRole?.roles?.name === 'admin';
  const isEVP = userRole?.roles?.name === 'evp_operations';

  const shouldFilter = user?.id && !isAdmin && !isEVP;

  const { data, isLoading } = useJobOrders(
    1,
    100,
    shouldFilter ? user?.id : undefined,
    shouldFilter ? 'driver' : undefined
  );

  const { data: calendarData, isLoading: isCalendarLoading } = useAllJobOrders(
    shouldFilter ? user?.id : undefined,
    shouldFilter ? 'driver' : undefined
  );

  const calendarEvents = useMemo(() => {
    if (!calendarData) return [];
    return calendarData
      .filter((order) => order.target_date)
      .map((order) => {
        const targetDate = new Date(order.target_date || new Date());
        return {
          id: order.id,
          title: `${order.vehicles?.make ?? ''} ${order.vehicles?.model ?? ''} — ${resolveStatus(order.status ?? '').label}`,
          start: targetDate.toISOString(),
          allDay: true,
          backgroundColor: statusEventColor(order.status || 'pending'),
          borderColor: statusEventColor(order.status || 'pending'),
          extendedProps: {
            vehicle: order.vehicles,
            status: order.status,
            repair_done: order.repair_done
          }
        };
      });
  }, [calendarData]);

  const handleEventClick = (clickInfo: EventClickArg) => {
    navigate({ to: `/job-order/${clickInfo.event.id}` });
  };

  const handleDateClick = (arg: { dateStr: string }) => {
    navigate({
      to: '/job-order/add-job-order',
      search: { date: arg.dateStr }
    });
  };

  const openOrder = (orderId: string) => {
    navigate({ to: `/job-order/${orderId}` });
  };

  const getDriverName = (driverId: string | null) => {
    if (!driverId) return 'Not assigned';
    const driver = drivers?.find((d) => d.id === driverId);
    return driver?.full_name || 'Unknown';
  };

  const handleNoteJobOrder = (orderId: string, data: NoteJobOrderData) => {
    noteJobOrder.mutateAsync({ id: orderId, ...data }).catch((error) => {
      console.error('Error noting job order:', error);
    });
  };

  const handleApproveJobOrder = (orderId: string) => {
    approveJobOrder.mutateAsync({ id: orderId }).catch((error) => {
      console.error('Error approving job order:', error);
    });
  };

  const handleCompleteRepair = (orderId: string, data: CompleteRepairData) => {
    completeRepair
      .mutateAsync({
        id: orderId,
        repairDone: data.repairDone,
        remarks: data.remarks || undefined,
        actualDateOfRelease: data.actualDateOfRelease || undefined
      })
      .catch((error) => {
        console.error('Error completing repair:', error);
      });
  };

  return (
    <div>
      <PageHeader
        title="Job Orders"
        description="Repairs raised against the fleet, and who is working on them."
        action={
          <Link to="/job-order/add-job-order" className={cn(buttonVariants())}>
            Create Job Order
          </Link>
        }
      />
      <Card>
        <CardContent className="pt-6">
          {/* Table first: it answers "what needs doing". The calendar is for planning. */}
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
              {isLoading ? (
                <TableSkeleton
                  columns={[
                    { label: 'Ref', width: 'w-14' },
                    { label: 'Status', width: 'w-28' },
                    { label: 'Vehicle', width: 'w-44' },
                    { label: 'Incident Date', width: 'w-24' },
                    { label: 'Assigned Mechanic', width: 'w-32' },
                    { label: 'Target Date', width: 'w-24' },
                    { label: 'Repair Type', width: 'w-20' },
                    { label: 'Actions', width: 'w-40' }
                  ]}
                />
              ) : !data?.data?.length ? (
                <EmptyState message="No job orders yet." />
              ) : (
                /* Table already renders its own overflow-x-auto container; the
                   min-width is what actually makes it scroll rather than letting
                   the browser squeeze the row actions — "Note Job Order",
                   "Approve", "Mark as Repaired" — until they clip. */
                <Table className="min-w-[1180px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[80px]">Ref</TableHead>
                      <TableHead className="w-[150px]">Status</TableHead>
                      <TableHead className="min-w-[200px]">Vehicle</TableHead>
                      <TableHead className="w-[130px]">Incident Date</TableHead>
                      <TableHead className="w-[160px]">
                        Assigned Mechanic
                      </TableHead>
                      <TableHead className="w-[130px]">Target Date</TableHead>
                      <TableHead className="w-[110px]">Repair Type</TableHead>
                      {/* Pinned: the row's transition ("Note Job Order",
                          "Mark as Repaired") is the point of the row, and it sat
                          past the scroll edge where it had to be hunted for. */}
                      <TableHead className="bg-card border-border sticky right-0 z-10 w-[260px] border-l text-right">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.data.map((order) => (
                      <TableRow
                        key={order.id}
                        className="cursor-pointer"
                        onClick={() => openOrder(order.id)}
                      >
                        <TableCell className="text-ink-soft font-mono text-sm whitespace-nowrap">
                          {formatRef('JO', order.order_no)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={order.status || 'pending'} />
                        </TableCell>
                        <TableCell>
                          {order.vehicles ? (
                            <span className="flex flex-col leading-tight">
                              <span>
                                {order.vehicles.make} {order.vehicles.model}
                              </span>
                              <span className="text-muted-foreground font-mono text-xs">
                                {order.vehicles.license_plate}
                              </span>
                            </span>
                          ) : (
                            <EmDash />
                          )}
                        </TableCell>
                        <TableCell>
                          <DateTimeCell value={order.incident_date} />
                        </TableCell>
                        <TableCell>
                          {getDriverName(order.assigned_mechanic)}
                        </TableCell>
                        <TableCell>
                          <DateTimeCell value={order.target_date} />
                        </TableCell>
                        <TableCell>
                          {order.repair_done ? (
                            order.repair_done.charAt(0).toUpperCase() +
                            order.repair_done.slice(1)
                          ) : (
                            <EmDash />
                          )}
                        </TableCell>
                        {/* The transition modals below are the real approval
                            controls; a click on one must not also open the record. */}
                        <TableCell
                          className="bg-card border-border sticky right-0 z-10 border-l"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-end gap-2">
                            {isAdmin && order.status === 'pending' && (
                              <NoteJobOrderModal
                                drivers={drivers}
                                onSubmit={(data) =>
                                  handleNoteJobOrder(order.id, data)
                                }
                                isLoading={noteJobOrder.isPending}
                                currentSparePartsUsed={
                                  Array.isArray(order.spare_parts_used)
                                    ? order.spare_parts_used
                                    : []
                                }
                              />
                            )}
                            {isEVP && order.status === 'assigned_mechanic' && (
                              <ApproveJobOrderModal
                                onSubmit={() => handleApproveJobOrder(order.id)}
                                isLoading={approveJobOrder.isPending}
                              />
                            )}
                            {isAdmin && order.status === 'ongoing_repair' && (
                              <CompleteRepairModal
                                onSubmit={(data) =>
                                  handleCompleteRepair(order.id, data)
                                }
                                isLoading={completeRepair.isPending}
                              />
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openOrder(order.id)}
                            >
                              <Eye className="h-4 w-4" />
                              View
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
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

export default JobOrdersPage;
