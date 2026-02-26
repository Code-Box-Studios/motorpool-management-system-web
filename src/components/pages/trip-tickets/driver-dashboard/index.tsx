import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import QRCode from 'react-qr-code';
import { Maximize2, X } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useDrivers } from '@/lib/query/drivers';
import { useTripTickets } from '@/lib/query/trip-tickets';
import { TRIP_TICKET_STATUS } from '@/lib/enums';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TableSkeleton } from '@/components/shared/skeleton/table-skeleton';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';

const DriverDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [fullscreenQrTicketId, setFullscreenQrTicketId] = useState<
    string | null
  >(null);

  const { data: driversData, isLoading: isDriversLoading } = useDrivers(
    1,
    1000
  );

  const currentDriver = useMemo(() => {
    if (!user?.email || !driversData?.data) return null;

    const normalizedUserEmail = user.email.trim().toLowerCase();

    return (
      driversData.data.find(
        (driver) => driver.email.trim().toLowerCase() === normalizedUserEmail
      ) || null
    );
  }, [user?.email, driversData?.data]);

  const { data: tripTicketsData, isLoading: isTripTicketsLoading } =
    useTripTickets(1, 100, undefined, undefined, currentDriver?.id);

  const driverTickets = tripTicketsData?.data || [];

  const getStatusLabel = (status: string | null) =>
    (status || TRIP_TICKET_STATUS.PENDING_ADMIN_APPROVAL).replace(/_/g, ' ');

  if (isDriversLoading || isTripTicketsLoading) {
    return <TableSkeleton />;
  }

  if (!currentDriver) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>My Trip Tickets</CardTitle>
          <CardDescription>
            Driver record not found for your account.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>My Trip Tickets</CardTitle>
          <CardDescription>
            View only trip tickets assigned to you as driver.
          </CardDescription>
        </CardHeader>
      </Card>

      {driverTickets.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {driverTickets.map((ticket) => (
            <Card key={ticket.id}>
              <CardHeader>
                <CardTitle className="text-base">
                  {ticket.destination}
                </CardTitle>
                <CardDescription className="capitalize">
                  {getStatusLabel(ticket.status)}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>
                  <strong>Purpose:</strong> {ticket.purpose}
                </p>
                <p>
                  <strong>Start:</strong>{' '}
                  {ticket.start_ts
                    ? new Date(ticket.start_ts).toLocaleString()
                    : 'N/A'}
                </p>
                <p>
                  <strong>End:</strong>{' '}
                  {ticket.end_ts
                    ? new Date(ticket.end_ts).toLocaleString()
                    : 'N/A'}
                </p>

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      navigate({
                        to: `/trip-tickets/${ticket.id}`,
                        search: { viewOnly: true }
                      })
                    }
                  >
                    View Details
                  </Button>

                  <Button
                    onClick={() => setFullscreenQrTicketId(ticket.id)}
                    className="gap-2"
                  >
                    <Maximize2 className="h-4 w-4" />
                    Fullscreen QR
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center">
            No trip tickets assigned to you.
          </CardContent>
        </Card>
      )}

      <AlertDialog
        open={!!fullscreenQrTicketId}
        onOpenChange={(open) => {
          if (!open) setFullscreenQrTicketId(null);
        }}
      >
        <AlertDialogContent className="max-w-3xl">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2"
            onClick={() => setFullscreenQrTicketId(null)}
          >
            <X className="h-4 w-4" />
          </Button>
          <AlertDialogHeader>
            <AlertDialogTitle>Driver QR Code</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="flex items-center justify-center py-6">
            {fullscreenQrTicketId ? (
              <div className="bg-background rounded-lg border p-6">
                <QRCode value={fullscreenQrTicketId} size={420} />
              </div>
            ) : null}
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default DriverDashboard;
