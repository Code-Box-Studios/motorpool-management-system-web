import { useJobOrders, useAllJobOrders } from '@/lib/query/job-orders';
import { Link, useNavigate } from '@tanstack/react-router';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import StatusBadge from '@/components/shared/status-badge';
import { formatRef } from '@/lib/utils/reference';
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

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: '#FFA500',
      assigned_mechanic: '#3B82F6',
      ongoing_repair: '#8B5CF6',
      evp_approval: '#F59E0B',
      completed: '#10B981'
    };
    return colors[status] || '#6B7280';
  };

  const calendarEvents = useMemo(() => {
    if (!calendarData) return [];
    return calendarData
      .filter((order) => order.target_date)
      .map((order) => {
        const targetDate = new Date(order.target_date || new Date());
        return {
          id: order.id,
          title: `${order.vehicles?.make || ''} ${order.vehicles?.model || ''} - ${order.status}`,
          start: targetDate.toISOString(),
          allDay: true,
          backgroundColor: getStatusColor(order.status || 'pending'),
          borderColor: getStatusColor(order.status || 'pending'),
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

  const getDriverName = (driverId: string | null) => {
    if (!driverId) return 'Not assigned';
    const driver = drivers?.find((d) => d.id === driverId);
    return driver?.full_name || 'Unknown';
  };

  const handleNoteJobOrder = (orderId: string, data: NoteJobOrderData) => {
    noteJobOrder
      .mutateAsync({ id: orderId, ...data })
      .catch((error) => {
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
          {/* Table first: it answers "what needs doing". The calendar is for planning. */}
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
              {isLoading ? (
                <TableSkeleton />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ref</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Vehicle</TableHead>
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
                          <TableCell className="text-ink-soft font-mono text-sm whitespace-nowrap">
                            {formatRef('JO', order.order_no)}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={order.status || 'pending'} />
                          </TableCell>
                          <TableCell>
                            {order.vehicles
                              ? `${order.vehicles.make} ${order.vehicles.model} - ${order.vehicles.license_plate}`
                              : 'N/A'}
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
                            {order.repair_done
                              ? order.repair_done.charAt(0).toUpperCase() +
                                order.repair_done.slice(1)
                              : 'N/A'}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
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
                              {isEVP &&
                                order.status === 'assigned_mechanic' && (
                                  <ApproveJobOrderModal
                                    onSubmit={() =>
                                      handleApproveJobOrder(order.id)
                                    }
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
                          colSpan={8}
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

export default JobOrdersPage;
