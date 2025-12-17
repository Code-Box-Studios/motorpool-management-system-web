import { useTripTickets } from '@/lib/query/trip-tickets';
import { useVehicles } from '@/lib/query/vehicles';
import { useDrivers } from '@/lib/query/drivers';
import { useUpdateTripTicket } from '@/lib/mutation/trip-tickets';
import { useAuth } from '@/hooks/use-auth';
import { useUserRole } from '@/hooks/use-user-role';
import {
  Card,
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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TRIP_TICKET_STATUS } from '@/lib/enums';
import { TableSkeleton } from '@/components/shared/skeleton/table-skeleton';
import { CheckCircle, XCircle } from 'lucide-react';

export default function GuardConfirmationPage() {
  const { user } = useAuth();
  const { data: userRole } = useUserRole();
  const updateTripTicket = useUpdateTripTicket();

  const rawBranchId = userRole?.branch_id || user?.user_metadata?.branch_id;
  const isValidUUID = (str: string) => {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  };
  const guardBranchId =
    rawBranchId && isValidUUID(rawBranchId) ? rawBranchId : undefined;

  const { data: tripTicketsData, isLoading } = useTripTickets(
    1,
    100,
    undefined,
    guardBranchId
  );

  const { data: vehiclesData } = useVehicles();
  const { data: driversData } = useDrivers();

  const handlePreTripConfirmation = (ticketId: string) => {
    updateTripTicket.mutate({
      id: ticketId,
      updates: {
        pre_trip_guard: user?.id,
        pre_trip_checked_by: user?.id,
        pre_trip_checked_at: new Date().toISOString(),
        status: TRIP_TICKET_STATUS.IN_PROGRESS
      }
    });
  };

  const handlePostTripConfirmation = (ticketId: string) => {
    updateTripTicket.mutate({
      id: ticketId,
      updates: {
        post_trip_guard: user?.id,
        post_trip_checked_by: user?.id,
        post_trip_checked_at: new Date().toISOString(),
        status: TRIP_TICKET_STATUS.COMPLETED
      }
    });
  };

  const pendingConfirmation = tripTicketsData?.data?.filter(
    (ticket) =>
      ticket.status === TRIP_TICKET_STATUS.APPROVED ||
      ticket.status === TRIP_TICKET_STATUS.IN_PROGRESS
  );

  const getVehicleName = (vehicleId: string) => {
    const vehicle = vehiclesData?.data?.find((v) => v.id === vehicleId);
    if (vehicle) {
      return `${vehicle.make} ${vehicle.model} (${vehicle.license_plate})`;
    }
    return vehicleId;
  };

  const getDriverName = (driverId: string) => {
    const driver = driversData?.data?.find((d) => d.id === driverId);
    return driver?.full_name || driverId;
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case TRIP_TICKET_STATUS.APPROVED:
        return 'default';
      case TRIP_TICKET_STATUS.IN_PROGRESS:
        return 'secondary';
      default:
        return 'outline';
    }
  };

  return (
    <div className="container mx-auto space-y-4 py-6">
      <Card>
        <CardHeader>
          <CardTitle>Trip Ticket Guard Confirmation</CardTitle>
          <CardDescription>
            Confirm trip tickets as vehicles enter and exit the campus. <br />
            <strong>Check Out:</strong> Confirm when vehicle leaves campus (sets
            status to In Progress). <br />
            <strong>Check In:</strong> Confirm when vehicle returns to campus
            (sets status to Completed).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Pre-Trip</TableHead>
                  <TableHead>Post-Trip</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingConfirmation && pendingConfirmation.length > 0 ? (
                  pendingConfirmation.map((ticket) => (
                    <TableRow key={ticket.id}>
                      <TableCell>
                        <Badge
                          variant={getStatusBadgeVariant(ticket.status || '')}
                          className="capitalize"
                        >
                          {ticket.status?.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>{ticket.destination}</TableCell>
                      <TableCell>{getVehicleName(ticket.vehicle_id)}</TableCell>
                      <TableCell>{getDriverName(ticket.driver_id)}</TableCell>
                      <TableCell>
                        {ticket.start_ts
                          ? new Date(ticket.start_ts).toLocaleString()
                          : 'N/A'}
                      </TableCell>
                      <TableCell>
                        {ticket.end_ts
                          ? new Date(ticket.end_ts).toLocaleString()
                          : 'N/A'}
                      </TableCell>
                      <TableCell>
                        {ticket.pre_trip_guard ? (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        ) : (
                          <XCircle className="h-5 w-5 text-gray-400" />
                        )}
                      </TableCell>
                      <TableCell>
                        {ticket.post_trip_guard ? (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        ) : (
                          <XCircle className="h-5 w-5 text-gray-400" />
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {!ticket.pre_trip_guard &&
                            ticket.status === TRIP_TICKET_STATUS.APPROVED && (
                              <Button
                                size="sm"
                                onClick={() =>
                                  handlePreTripConfirmation(ticket.id)
                                }
                                disabled={updateTripTicket.isPending}
                              >
                                Check Out
                              </Button>
                            )}
                          {ticket.pre_trip_guard &&
                            !ticket.post_trip_guard &&
                            ticket.status ===
                              TRIP_TICKET_STATUS.IN_PROGRESS && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() =>
                                  handlePostTripConfirmation(ticket.id)
                                }
                                disabled={updateTripTicket.isPending}
                              >
                                Check In
                              </Button>
                            )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="text-muted-foreground text-center"
                    >
                      No trip tickets pending confirmation
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
