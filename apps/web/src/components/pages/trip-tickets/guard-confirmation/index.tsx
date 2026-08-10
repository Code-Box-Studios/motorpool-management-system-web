import { useTripTickets } from '@/lib/query/trip-tickets';
import { useAllVehicles } from '@/lib/query/vehicles';
import { useAllDrivers } from '@/lib/query/drivers';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import StatusBadge from '@/components/shared/status-badge';
import { TRIP_TICKET_STATUS } from '@/lib/enums';
import { QrCode, ChevronRight, ArrowRight } from 'lucide-react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { toast } from 'sonner';
import { formatRef } from '@/lib/utils/reference';

// Initials for the avatar chip — a name, never an id.
const initials = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

/**
 * The gate screen. The guard is standing outside with a vehicle idling in front
 * of them, on a phone — so this is one decision at a time: the vehicle that is
 * AT THE GATE NOW gets the whole screen and one very large button. Everything
 * else is a short "next at gate" list underneath.
 */
export default function GuardConfirmationPage() {
  const { user } = useAuth();
  const { data: userRole } = useUserRole();
  const checkOutTripTicket = useCheckOutTripTicket();
  const checkInTripTicket = useCheckInTripTicket();
  const [confirmAction, setConfirmAction] = useState<{
    type: 'check-out' | 'check-in';
    ticketId: string;
    vehicleId: string;
  } | null>(null);
  const [isQrVerified, setIsQrVerified] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [scanError, setScanError] = useState('');
  // The odometer as the guard reads it off the dash. This is the only thing in
  // the whole system that advances the vehicle's mileage, and every preventive
  // and predictive maintenance figure is computed from that number.
  const [odometer, setOdometer] = useState('');
  const [odometerError, setOdometerError] = useState('');

  const extractUuid = (value: string) => {
    const match = value
      .toLowerCase()
      .match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
    return match?.[0] || null;
  };

  const rawBranchId = userRole?.branch_id || user?.user_metadata?.branch_id;
  const isValidUUID = (str: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
  const guardBranchId =
    rawBranchId && isValidUUID(rawBranchId) ? rawBranchId : undefined;

  const { data: tripTicketsData, isLoading } = useTripTickets(
    1,
    100,
    undefined,
    guardBranchId
  );
  const { data: vehicles } = useAllVehicles();
  const { data: drivers } = useAllDrivers();

  const getVehicle = (vehicleId: string) =>
    vehicles?.find((v) => v.id === vehicleId);
  const getDriverName = (driverId: string) =>
    drivers?.find((d) => d.id === driverId)?.full_name ?? 'Unknown driver';

  const resetDialog = () => {
    setIsQrVerified(false);
    setCameraError('');
    setScanError('');
    setOdometer('');
    setOdometerError('');
  };

  const openCheckOut = (ticketId: string, vehicleId: string) => {
    resetDialog();
    setConfirmAction({ type: 'check-out', ticketId, vehicleId });
  };

  const openCheckIn = (ticketId: string, vehicleId: string) => {
    resetDialog();
    setConfirmAction({ type: 'check-in', ticketId, vehicleId });
  };

  const closeQrDialog = () => {
    setConfirmAction(null);
    resetDialog();
  };

  // The reading already on record — the guard's number can never be below it.
  const pendingVehicle = confirmAction
    ? getVehicle(confirmAction.vehicleId)
    : undefined;
  const currentOdometer = pendingVehicle?.mileage ?? 0;

  const handleScanResult = (detectedCodes: Array<{ rawValue?: string }>) => {
    if (!confirmAction || isQrVerified || !detectedCodes.length) return;

    const rawScannedValue = (detectedCodes[0]?.rawValue || '').trim();
    if (!rawScannedValue) return;

    const scannedId = extractUuid(rawScannedValue);
    const expectedId =
      extractUuid(confirmAction.ticketId) ||
      confirmAction.ticketId.trim().toLowerCase();

    if (!scannedId) {
      setScanError(
        'That QR code is not a trip ticket. Scan the code on the driver’s ticket.'
      );
      return;
    }
    if (scannedId !== expectedId) {
      setScanError('That QR code belongs to a different trip ticket.');
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
      setScanError('Scan the driver’s QR code before continuing.');
      return;
    }
    setScanError('');

    const reading = Number(odometer);
    if (!odometer.trim() || !Number.isFinite(reading)) {
      setOdometerError('Read the odometer off the dash and enter it.');
      return;
    }
    if (reading < currentOdometer) {
      setOdometerError(
        `Cannot be below the last reading (${currentOdometer.toLocaleString()} km).`
      );
      return;
    }
    setOdometerError('');

    if (confirmAction.type === 'check-out') {
      checkOutTripTicket.mutate(
        { id: confirmAction.ticketId, startMileage: reading },
        { onSettled: closeQrDialog }
      );
    } else {
      checkInTripTicket.mutate(
        { id: confirmAction.ticketId, endMileage: reading },
        { onSettled: closeQrDialog }
      );
    }
  };

  // Anything the guard can act on: cleared to leave, or out and due back.
  const atGate =
    tripTicketsData?.data?.filter(
      (t) =>
        t.status === TRIP_TICKET_STATUS.APPROVED ||
        t.status === TRIP_TICKET_STATUS.IN_PROGRESS
    ) ?? [];

  const [current, ...queue] = atGate;

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-md">
        <Skeleton className="h-[420px] w-full rounded-[28px]" />
      </div>
    );
  }

  if (!current) {
    return (
      <div className="mx-auto w-full max-w-md py-10 text-center">
        <div className="border-border text-muted-foreground rounded-[28px] border border-dashed px-6 py-20">
          Nothing at the gate. Approved trips will appear here.
        </div>
      </div>
    );
  }

  const vehicle = getVehicle(current.vehicle_id);
  const driverName = getDriverName(current.driver_id);
  const isReturning = current.status === TRIP_TICKET_STATUS.IN_PROGRESS;

  return (
    <div className="mx-auto w-full max-w-md">
      {/* ---------- The vehicle in front of you ---------- */}
      <div className="mb-3 flex items-center gap-2">
        <span className="bg-signal size-2 rounded-full" />
        <span className="text-muted-foreground text-xs font-bold tracking-[0.11em] uppercase">
          At the gate now
        </span>
      </div>

      <section className="bg-card border-border rounded-[28px] border p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between gap-3">
          <StatusBadge status={current.status ?? ''} />
          <span className="text-muted-foreground font-mono text-xs">
            {formatRef('TT', current.ticket_no)}
          </span>
        </div>

        <h1 className="text-3xl font-semibold tracking-tight">
          {vehicle ? `${vehicle.make} ${vehicle.model}` : 'Vehicle'}
        </h1>
        {vehicle?.license_plate && (
          <div className="bg-primary text-primary-foreground mt-2.5 inline-block rounded-xl px-4 py-1.5 font-mono text-xl font-bold tracking-wider">
            {vehicle.license_plate}
          </div>
        )}

        <div className="bg-border my-5 h-px" />

        <div className="flex items-center gap-3">
          <span className="bg-muted text-muted-foreground flex size-11 flex-none items-center justify-center rounded-full text-sm font-bold">
            {initials(driverName)}
          </span>
          <div className="min-w-0">
            <div className="font-semibold">{driverName}</div>
            <div className="text-slate text-sm">Driver</div>
          </div>
        </div>

        <div className="text-ink-soft mt-3.5 text-sm">
          {current.destination}
        </div>

        {/* Verify — the person must match the ticket. */}
        <button
          type="button"
          onClick={() =>
            isReturning
              ? openCheckIn(current.id, current.vehicle_id)
              : openCheckOut(current.id, current.vehicle_id)
          }
          className="border-line-strong hover:bg-accent mt-5 flex w-full items-center gap-3.5 rounded-[20px] border-[1.5px] border-dashed p-3.5 text-left transition-colors"
        >
          <span className="border-foreground flex size-12 flex-none items-center justify-center rounded-xl border-2">
            <QrCode className="size-6" />
          </span>
          <span className="flex-1">
            <span className="block font-semibold">
              Scan driver QR to verify
            </span>
            <span className="text-slate block text-xs">
              Confirms the person matches {formatRef('TT', current.ticket_no)}
            </span>
          </span>
          <ChevronRight className="text-muted-foreground size-5 flex-none" />
        </button>

        {/* The whole job, one button. */}
        <Button
          onClick={() =>
            isReturning
              ? openCheckIn(current.id, current.vehicle_id)
              : openCheckOut(current.id, current.vehicle_id)
          }
          disabled={checkOutTripTicket.isPending || checkInTripTicket.isPending}
          className="mt-4 h-16 w-full rounded-[22px] text-lg font-semibold"
        >
          {isReturning ? 'Time in Vehicle' : 'Time out Vehicle'}
          <ArrowRight className="size-5" />
        </Button>
        <p className="text-slate mt-2.5 text-center text-xs">
          {isReturning
            ? 'Records the return and frees the vehicle.'
            : 'Releases the vehicle and starts the trip.'}
        </p>
      </section>

      {/* ---------- Next at gate ---------- */}
      {queue.length > 0 && (
        <section className="mt-7">
          <div className="text-muted-foreground mb-2.5 px-1 text-xs font-bold tracking-[0.11em] uppercase">
            Next at gate
          </div>
          <ul className="flex flex-col gap-2.5">
            {queue.map((ticket) => {
              const v = getVehicle(ticket.vehicle_id);
              return (
                <li
                  key={ticket.id}
                  className="bg-card border-border flex items-center gap-3.5 rounded-[18px] border p-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">
                      {v ? `${v.make} ${v.model}` : 'Vehicle'}
                      {v?.license_plate && (
                        <span className="ml-1.5 font-mono text-xs">
                          {v.license_plate}
                        </span>
                      )}
                    </div>
                    <div className="text-slate truncate text-xs">
                      {getDriverName(ticket.driver_id)} → {ticket.destination}
                    </div>
                  </div>
                  <StatusBadge status={ticket.status ?? ''} />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ---------- QR verification ---------- */}
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
                ? 'Scan to time out'
                : 'Scan to time in'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Point the camera at the QR code on the driver’s trip ticket.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            <div className="overflow-hidden rounded-[20px] border">
              <Scanner
                constraints={{ facingMode: 'environment' }}
                onScan={handleScanResult}
                onError={() =>
                  setCameraError(
                    'Cannot reach the camera. Allow camera access and try again.'
                  )
                }
                styles={{ container: { width: '100%' } }}
              />
            </div>
            {isQrVerified && (
              <p className="text-status-done-fg text-sm font-medium">
                QR verified — you can proceed.
              </p>
            )}
            {cameraError && (
              <p className="text-destructive text-sm">{cameraError}</p>
            )}
            {scanError && (
              <p className="text-destructive text-sm">{scanError}</p>
            )}

            {/* The odometer. Nothing else in the system moves this number, and
                the whole maintenance schedule is computed from it. */}
            <div className="border-border space-y-1.5 border-t pt-3">
              <Label htmlFor="odometer" className="text-sm font-medium">
                Odometer now
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="odometer"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={currentOdometer.toLocaleString()}
                  value={odometer}
                  onChange={(e) => {
                    setOdometer(e.target.value.replace(/[^0-9]/g, ''));
                    setOdometerError('');
                  }}
                  aria-invalid={Boolean(odometerError)}
                  className="h-12 text-lg"
                />
                <span className="text-muted-foreground text-sm">km</span>
              </div>
              <p className="text-muted-foreground text-xs">
                Last recorded: {currentOdometer.toLocaleString()} km
              </p>
              {odometerError && (
                <p className="text-destructive text-sm">{odometerError}</p>
              )}
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={
                checkOutTripTicket.isPending || checkInTripTicket.isPending
              }
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
              {confirmAction?.type === 'check-out' ? 'Time out' : 'Time in'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
