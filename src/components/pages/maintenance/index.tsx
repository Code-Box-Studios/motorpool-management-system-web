import { useAllMaintenances, useMaintenances } from '@/lib/query/maintenance';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Eye, Pencil, Trash2 } from 'lucide-react';
import { useDeleteMaintenance } from '@/lib/mutation/maintenance';
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
import { useMemo, useState } from 'react';
import PredictiveMaintenance from '../dashboard/predictive-maintenance';

const MaintenancePage = () => {
  const { data: tableData, isLoading: isTableLoading } = useMaintenances(
    1,
    100
  );
  const { data: calendarData, isLoading: isCalendarLoading } =
    useAllMaintenances();
  const navigate = useNavigate();
  const deleteMaintenance = useDeleteMaintenance();
  const searchParams = useSearch({ strict: false }) as { tab?: string };
  const activeTab = searchParams.tab || 'schedule';
  const [scheduleView, setScheduleView] = useState<'calendar' | 'table'>(
    'calendar'
  );

  const handleTabChange = (value: string) => {
    navigate({
      to: '/maintenance',
      search: { tab: value }
    });
  };

  const calendarEvents = useMemo(() => {
    if (!calendarData) return [];
    return calendarData.map((maintenance) => ({
      id: maintenance.id,
      title: `${maintenance.type} - ${maintenance.vehicle_id}`,
      start: maintenance.date,
      backgroundColor: getMaintenanceColor(maintenance.type),
      borderColor: getMaintenanceColor(maintenance.type),
      extendedProps: {
        description: maintenance.description,
        cost: maintenance.cost,
        mileage: maintenance.mileage
      }
    }));
  }, [calendarData]);

  const handleEventClick = (clickInfo: EventClickArg) => {
    navigate({ to: `/maintenance/${clickInfo.event.id}` });
  };

  const handleDateClick = (arg: { dateStr: string }) => {
    navigate({
      to: '/maintenance/add-maintenance',
      search: { date: arg.dateStr }
    });
  };

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
      <TabsList className="grid w-full max-w-2xl grid-cols-2">
        <TabsTrigger value="schedule">Schedule</TabsTrigger>
        <TabsTrigger value="predictive">Predictive</TabsTrigger>
      </TabsList>
      <TabsContent value="schedule" className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Maintenance</CardTitle>
            <CardDescription>
              Manage and view maintenance records.
            </CardDescription>
            <CardAction>
              <Link
                to="/maintenance/add-maintenance"
                className={cn(buttonVariants())}
              >
                Create Maintenance
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            <Tabs
              value={scheduleView}
              onValueChange={(value) =>
                setScheduleView(value as 'calendar' | 'table')
              }
              className="w-full"
            >
              <TabsList className="grid w-full max-w-2xl grid-cols-2">
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
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Cost</TableHead>
                        <TableHead>Mileage</TableHead>
                        <TableHead>Next Due</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tableData?.data && tableData.data.length > 0 ? (
                        tableData.data.map((maintenance) => (
                          <TableRow key={maintenance.id}>
                            <TableCell>
                              {new Date(maintenance.date).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="capitalize">
                              {maintenance.type}
                            </TableCell>
                            <TableCell className="max-w-xs truncate">
                              {maintenance.description || 'N/A'}
                            </TableCell>
                            <TableCell>
                              {maintenance.cost !== null
                                ? `$${maintenance.cost.toFixed(2)}`
                                : 'N/A'}
                            </TableCell>
                            <TableCell>
                              {maintenance.mileage !== null
                                ? `${maintenance.mileage} km`
                                : 'N/A'}
                            </TableCell>
                            <TableCell>
                              {maintenance.next_due
                                ? new Date(
                                    maintenance.next_due
                                  ).toLocaleDateString()
                                : 'N/A'}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      disabled={deleteMaintenance.isPending}
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
                                        This action cannot be undone. This will
                                        permanently delete the maintenance
                                        record and remove the data from the
                                        server.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>
                                        Cancel
                                      </AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() =>
                                          deleteMaintenance.mutate(
                                            maintenance.id
                                          )
                                        }
                                      >
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>

                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() =>
                                    navigate({
                                      to: `/maintenance/${maintenance.id}`,
                                      search: { edit: true }
                                    })
                                  }
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>

                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() =>
                                    navigate({
                                      to: `/maintenance/${maintenance.id}`
                                    })
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
      </TabsContent>
      <TabsContent value="predictive" className="mt-6">
        <PredictiveMaintenance showViewAll={false} />
      </TabsContent>
    </Tabs>
  );
};

function getMaintenanceColor(type: string): string {
  const colors: Record<string, string> = {
    preventive: '#3b82f6',
    corrective: '#ef4444',
    inspection: '#10b981',
    repair: '#f59e0b',
    service: '#8b5cf6'
  };
  return colors[type] || '#6b7280';
}

export default MaintenancePage;
