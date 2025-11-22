import { useAllMaintenances, useMaintenances } from '@/lib/query/maintenance';
import { Link, useNavigate } from '@tanstack/react-router';
import { Button, buttonVariants } from '@/components/ui/button';
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

const MaintenancePage = () => {
  const { data: tableData, isLoading: isTableLoading } = useMaintenances(
    1,
    100
  );
  const { data: calendarData, isLoading: isCalendarLoading } =
    useAllMaintenances();
  const navigate = useNavigate();

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
    <div>
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
                    {tableData?.data?.map((maintenance) => (
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
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              navigate({ to: `/maintenance/${maintenance.id}` })
                            }
                          >
                            View Details
                          </Button>
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
