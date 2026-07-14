import { useAllMaintenances, useMaintenances } from '@/lib/query/maintenance';
import { useAllVehicles } from '@/lib/query/vehicles';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { Button, buttonVariants } from '@/components/ui/button';
import PageHeader from '@/components/shared/page-header';
import { maintenanceEventColor } from '@/lib/status';
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
import { Card, CardContent } from '@/components/ui/card';
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
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventClickArg } from '@fullcalendar/core';
import { useMemo, useState } from 'react';
import PreventiveMaintenance from '../dashboard/preventive-maintenance';
import PredictiveMaintenance from '../dashboard/predictive-maintenance';

// shadcn paints the ACTIVE tab with --background — a canvas beige that sits
// *lighter* than the --muted track behind the inactive one, so on a white card
// the segmented control read inverted, the unselected view looking selected.
// Emphasis is the ink pill this app already uses for the primary button and the
// active sidebar item.
const ACTIVE_TAB =
  'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground dark:data-[state=active]:bg-primary dark:data-[state=active]:text-primary-foreground dark:data-[state=active]:border-primary';

const EmDash = () => <span className="text-muted-foreground">—</span>;

const MaintenancePage = () => {
  const { data: tableData, isLoading: isTableLoading } = useMaintenances(
    1,
    100
  );
  const { data: calendarData, isLoading: isCalendarLoading } =
    useAllMaintenances();
  const { data: vehicles } = useAllVehicles();
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

  // A maintenance record only means something next to the vehicle it is for.
  // The calendar used to print the raw vehicle_id, which told the reader nothing.
  const vehicleCell = (vehicleId: string | null | undefined) => {
    const vehicle = vehicleId
      ? vehicles?.find((v) => v.id === vehicleId)
      : undefined;
    if (!vehicle) {
      return <span className="text-muted-foreground">Unassigned vehicle</span>;
    }
    return (
      <span className="flex flex-col leading-tight">
        <span>
          {vehicle.make} {vehicle.model}
        </span>
        <span className="text-muted-foreground font-mono text-xs">
          {vehicle.license_plate}
        </span>
      </span>
    );
  };

  const calendarEvents = useMemo(() => {
    if (!calendarData) return [];
    return calendarData.map((maintenance) => {
      const vehicle = vehicles?.find((v) => v.id === maintenance.vehicle_id);
      const label = vehicle
        ? `${vehicle.make} ${vehicle.model} · ${vehicle.license_plate}`
        : 'Unassigned vehicle';
      return {
        id: maintenance.id,
        title: `${maintenance.type} — ${label}`,
        start: maintenance.date,
        backgroundColor: maintenanceEventColor(maintenance.type),
        borderColor: maintenanceEventColor(maintenance.type),
        extendedProps: {
          description: maintenance.description,
          cost: maintenance.cost,
          mileage: maintenance.mileage
        }
      };
    });
  }, [calendarData, vehicles]);

  const handleEventClick = (clickInfo: EventClickArg) => {
    navigate({ to: `/maintenance/${clickInfo.event.id}` });
  };

  const handleDateClick = (arg: { dateStr: string }) => {
    navigate({
      to: '/maintenance/add-maintenance',
      search: { date: arg.dateStr }
    });
  };

  const openMaintenance = (maintenanceId: string) => {
    navigate({ to: `/maintenance/${maintenanceId}` });
  };

  return (
    <div>
      <PageHeader
        title="Maintenance"
        description="Scheduled work, plus what the fleet is likely to need next."
        action={
          <Link
            to="/maintenance/add-maintenance"
            className={cn(buttonVariants())}
          >
            Create Maintenance
          </Link>
        }
      />

      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="w-full"
      >
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="schedule" className={ACTIVE_TAB}>
            Schedule
          </TabsTrigger>
          <TabsTrigger value="preventive" className={ACTIVE_TAB}>
            Preventive
          </TabsTrigger>
          <TabsTrigger value="predictive" className={ACTIVE_TAB}>
            Predictive
          </TabsTrigger>
        </TabsList>
        <TabsContent value="schedule" className="mt-6">
          <Card>
            <CardContent className="pt-6">
              {/* Calendar vs table is a way of *looking* at the same records,
                  not a separate section — so it is a small control, not a
                  second full-width tab bar competing with the one above. */}
              <Tabs
                value={scheduleView}
                onValueChange={(value) =>
                  setScheduleView(value as 'calendar' | 'table')
                }
                className="w-full"
              >
                <div className="flex justify-end">
                  <TabsList>
                    <TabsTrigger value="calendar" className={ACTIVE_TAB}>
                      Calendar
                    </TabsTrigger>
                    <TabsTrigger value="table" className={ACTIVE_TAB}>
                      Table
                    </TabsTrigger>
                  </TabsList>
                </div>
                <TabsContent value="calendar" className="mt-6">
                  {isCalendarLoading ? (
                    <div className="text-muted-foreground py-12 text-center text-sm">
                      Loading calendar...
                    </div>
                  ) : (
                    <FullCalendar
                      plugins={[
                        dayGridPlugin,
                        timeGridPlugin,
                        interactionPlugin
                      ]}
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
                        { label: 'Date', width: 'w-20' },
                        { label: 'Vehicle', width: 'w-44' },
                        { label: 'Type', width: 'w-20' },
                        { label: 'Description', width: 'w-48' },
                        { label: 'Cost', width: 'w-16' },
                        { label: 'Mileage', width: 'w-16' },
                        { label: 'Next Due', width: 'w-20' },
                        { label: 'Actions', width: 'w-32' }
                      ]}
                    />
                  ) : !tableData?.data?.length ? (
                    <EmptyState message="No maintenance records yet." />
                  ) : (
                    /* Table already renders its own overflow-x-auto container;
                       the min-width is what actually makes it scroll rather than
                       letting the browser squeeze the row actions until they
                       clip. */
                    <Table className="min-w-[1080px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[110px]">Date</TableHead>
                          <TableHead className="min-w-[200px]">
                            Vehicle
                          </TableHead>
                          <TableHead className="w-[120px]">Type</TableHead>
                          <TableHead className="min-w-[220px]">
                            Description
                          </TableHead>
                          <TableHead className="w-[100px] text-right">
                            Cost
                          </TableHead>
                          <TableHead className="w-[110px] text-right">
                            Mileage
                          </TableHead>
                          <TableHead className="w-[110px]">Next Due</TableHead>
                          <TableHead className="w-[170px] text-right">
                            Actions
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tableData.data.map((maintenance) => (
                          <TableRow
                            key={maintenance.id}
                            className="cursor-pointer"
                            onClick={() => openMaintenance(maintenance.id)}
                          >
                            <TableCell>
                              {new Date(maintenance.date).toLocaleDateString()}
                            </TableCell>
                            <TableCell>
                              {vehicleCell(maintenance.vehicle_id)}
                            </TableCell>
                            <TableCell className="capitalize">
                              {maintenance.type}
                            </TableCell>
                            <TableCell className="text-muted-foreground max-w-xs truncate">
                              {maintenance.description || <EmDash />}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {maintenance.cost !== null ? (
                                `$${maintenance.cost.toFixed(2)}`
                              ) : (
                                <EmDash />
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {maintenance.mileage !== null ? (
                                `${maintenance.mileage} km`
                              ) : (
                                <EmDash />
                              )}
                            </TableCell>
                            <TableCell>
                              {maintenance.next_due ? (
                                new Date(
                                  maintenance.next_due
                                ).toLocaleDateString()
                              ) : (
                                <EmDash />
                              )}
                            </TableCell>
                            {/* Edit and delete are destructive-adjacent; a click
                                on one must not also open the record. */}
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    openMaintenance(maintenance.id)
                                  }
                                >
                                  <Eye className="h-4 w-4" />
                                  View
                                </Button>

                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label="Edit maintenance record"
                                  title="Edit"
                                  onClick={() =>
                                    navigate({
                                      to: `/maintenance/${maintenance.id}`,
                                      search: { edit: true }
                                    })
                                  }
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>

                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon-sm"
                                      aria-label="Delete maintenance record"
                                      title="Delete"
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
        </TabsContent>
        <TabsContent value="preventive" className="mt-6">
          <PreventiveMaintenance showViewAll={false} />
        </TabsContent>
        <TabsContent value="predictive" className="mt-6">
          <PredictiveMaintenance showViewAll={false} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default MaintenancePage;
