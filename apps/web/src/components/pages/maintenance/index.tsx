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
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventClickArg } from '@fullcalendar/core';
import { useMemo, useState } from 'react';
import PreventiveMaintenance from '../dashboard/preventive-maintenance';
import PredictiveMaintenance from '../dashboard/predictive-maintenance';

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
  const vehicleLabel = (vehicleId: string | null | undefined) => {
    const vehicle = vehicleId
      ? vehicles?.find((v) => v.id === vehicleId)
      : undefined;
    return vehicle
      ? `${vehicle.make} ${vehicle.model} · ${vehicle.license_plate}`
      : 'Unassigned vehicle';
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
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="preventive">Preventive</TabsTrigger>
          <TabsTrigger value="predictive">Predictive</TabsTrigger>
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
                    <TabsTrigger value="calendar">Calendar</TabsTrigger>
                    <TabsTrigger value="table">Table</TabsTrigger>
                  </TabsList>
                </div>
                <TabsContent value="calendar" className="mt-6">
                  {isCalendarLoading ? (
                    <div>Loading calendar...</div>
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
                        { label: 'Date', width: 'w-24' },
                        { label: 'Vehicle', width: 'w-40' },
                        { label: 'Type', width: 'w-24' },
                        { label: 'Description', width: 'w-40' },
                        { label: 'Cost', width: 'w-20' },
                        { label: 'Mileage', width: 'w-20' },
                        { label: 'Next Due', width: 'w-24' },
                        { label: 'Actions', width: 'w-10' }
                      ]}
                    />
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Vehicle</TableHead>
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
                                {new Date(
                                  maintenance.date
                                ).toLocaleDateString()}
                              </TableCell>
                              <TableCell>
                                {vehicleLabel(maintenance.vehicle_id)}
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
                                          This action cannot be undone. This
                                          will permanently delete the
                                          maintenance record and remove the data
                                          from the server.
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
