import { useTripTickets } from '@/lib/query/trip-tickets';
import { useVehicles } from '@/lib/query/vehicles';
import { useDrivers } from '@/lib/query/drivers';
import {
  useCheckOutTripTicket,
  useCheckInTripTicket
} from '@/lib/mutation/trip-tickets';
import { useAuth } from '@/hooks/use-auth';
import { useUserRole } from '@/hooks/use-user-role';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TRIP_TICKET_STATUS } from '@/lib/enums';
import { TableSkeleton } from '@/components/shared/skeleton/table-skeleton';
import { CheckCircle, XCircle } from 'lucide-react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { toast } from 'sonner';

export default function GuardConfirmationPage() {
  const { user } = useAuth();
  const { data: userRole } = useUserRole();
  const checkOutTripTicket = useCheckOutTripTicket();
  const checkInTripTicket = useCheckInTripTicket();
  const [confirmAction, setConfirmAction] = useState<{
    type: 'check-out' | 'check-in';
    ticketId: string;
  } | null>(null);
  const [isQrVerified, setIsQrVerified] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [scanError, setScanError] = useState('');
  const extractUuid = (value: string) => {
    const match = value
      .toLowerCase()
      .match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
    return match?.[0] || null;
  };

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
    setIsQrVerified(false);
    setCameraError('');
    setScanError('');
    setConfirmAction({ type: 'check-out', ticketId });
  };

  const handlePostTripConfirmation = (ticketId: string) => {
    setIsQrVerified(false);
    setCameraError('');
    setScanError('');
    setConfirmAction({ type: 'check-in', ticketId });
  };

  const closeQrDialog = () => {
    setConfirmAction(null);
    setIsQrVerified(false);
    setCameraError('');
    setScanError('');
  };

  const handleScanResult = (detectedCodes: Array<{ rawValue?: string }>) => {
    if (!confirmAction || isQrVerified || !detectedCodes.length) return;

    const rawScannedValue = (detectedCodes[0]?.rawValue || '').trim();
    const scannedId = extractUuid(rawScannedValue);
    const expectedId =
      extractUuid(confirmAction.ticketId) ||
      confirmAction.ticketId.trim().toLowerCase();

    if (!rawScannedValue) return;

    if (!scannedId) {
      setScanError(
        'Scanned QR code is invalid. Please scan a valid trip ticket QR.'
      );
      return;
    }

    if (scannedId !== expectedId) {
      setScanError('Scanned QR code does not match the selected trip ticket.');
      return;
    }

    setScanError('');
    setCameraError('');
    setIsQrVerified(true);
    toast.success('QR verified. You can proceed.');
  };

  const handleConfirmAction = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (!confirmAction) return;

    if (!isQrVerified) {
      setScanError('Scan a valid QR code using the camera before continuing.');
      return;
    }

    setScanError('');

    if (confirmAction.type === 'check-out') {
      checkOutTripTicket.mutate(
        { id: confirmAction.ticketId },
        { onSettled: closeQrDialog }
      );
    } else {
      checkInTripTicket.mutate(
        { id: confirmAction.ticketId },
        { onSettled: closeQrDialog }
      );
    }
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
            <div className="grid gap-4 md:grid-cols-2">
              {pendingConfirmation && pendingConfirmation.length > 0 ? (
                pendingConfirmation.map((ticket) => (
                  <Card key={ticket.id}>
                    <CardHeader className="gap-3">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-base">
                          {ticket.destination}
                        </CardTitle>
                        <Badge
                          variant={getStatusBadgeVariant(ticket.status || '')}
                          className="capitalize"
                        >
                          {ticket.status?.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                      <CardDescription className="break-all">
                        Trip Ticket ID: {ticket.id}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-2 text-sm">
                        <p>
                          <strong>Vehicle:</strong>{' '}
                          {getVehicleName(ticket.vehicle_id)}
                        </p>
                        <p>
                          <strong>Driver:</strong>{' '}
                          {getDriverName(ticket.driver_id)}
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
                      </div>

                      <div className="flex items-center gap-6 text-sm">
                        <div className="flex items-center gap-2">
                          {ticket.pre_trip_guard ? (
                            <CheckCircle className="h-5 w-5 text-green-500" />
                          ) : (
                            <XCircle className="h-5 w-5 text-gray-400" />
                          )}
                          <span>Pre-Trip</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {ticket.post_trip_guard ? (
                            <CheckCircle className="h-5 w-5 text-green-500" />
                          ) : (
                            <XCircle className="h-5 w-5 text-gray-400" />
                          )}
                          <span>Post-Trip</span>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        {!ticket.pre_trip_guard &&
                          ticket.status === TRIP_TICKET_STATUS.APPROVED && (
                            <Button
                              size="sm"
                              onClick={() =>
                                handlePreTripConfirmation(ticket.id)
                              }
                              disabled={checkOutTripTicket.isPending}
                            >
                              Check Out
                            </Button>
                          )}
                        {ticket.pre_trip_guard &&
                          !ticket.post_trip_guard &&
                          ticket.status === TRIP_TICKET_STATUS.IN_PROGRESS && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() =>
                                handlePostTripConfirmation(ticket.id)
                              }
                              disabled={checkInTripTicket.isPending}
                            >
                              Check In
                            </Button>
                          )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <div className="text-muted-foreground py-8 text-center md:col-span-2">
                  No trip tickets pending confirmation
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={!!confirmAction}
        onOpenChange={(open) => {
          if (!open) closeQrDialog();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === 'check-out'
                ? 'Scan QR for Check Out'
                : 'Scan QR for Check In'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Use the camera to scan the driver QR code for this trip.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            <div className="overflow-hidden rounded-md border">
              <Scanner
                constraints={{ facingMode: 'environment' }}
                onScan={handleScanResult}
                onError={(error) => {
                  console.error('QR camera error:', error);
                  setCameraError(
                    'Unable to access camera. Please allow camera permission.'
                  );
                }}
                styles={{ container: { width: '100%' } }}
              />
            </div>
            {isQrVerified ? (
              <p className="text-sm text-green-600">
                QR verified. Ready to continue.
              </p>
            ) : (
              <p className="text-muted-foreground text-xs">
                Point the camera at the driver QR code.
              </p>
            )}
            {cameraError ? (
              <p className="text-sm text-red-500">{cameraError}</p>
            ) : null}
            {scanError ? (
              <p className="text-sm text-red-500">{scanError}</p>
            ) : null}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={checkOutTripTicket.isPending || checkInTripTicket.isPending}
              onClick={closeQrDialog}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={
                checkOutTripTicket.isPending ||
                checkInTripTicket.isPending ||
                !isQrVerified
              }
              onClick={handleConfirmAction}
            >
              {confirmAction?.type === 'check-out' ? 'Check Out' : 'Check In'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
