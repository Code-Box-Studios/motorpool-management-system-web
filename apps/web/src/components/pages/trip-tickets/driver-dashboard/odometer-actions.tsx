import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Gauge, X } from 'lucide-react';
import { recordTripOdometer, type TripDateRow } from '@/lib/api/trip-tickets';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { historyTime } from '@/lib/utils/trip-history';
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';

interface OdometerTarget {
  ticketId: string;
  dateId: string;
  phase: 'before' | 'after';
  startTs: string;
}

export function OdometerActions({
  ticketId,
  date,
  approved
}: {
  ticketId: string;
  date: TripDateRow;
  approved: boolean;
}) {
  const [target, setTarget] = useState<OdometerTarget | null>(null);
  const phase = target?.phase ?? null;
  const [value, setValue] = useState('');
  const trigger = useRef<HTMLElement | null>(null);
  const queryClient = useQueryClient();
  const reading = useMutation({
    mutationFn: ({
      ticketId,
      dateId,
      phase,
      mileage
    }: OdometerTarget & { mileage: number }) =>
      recordTripOdometer(ticketId, dateId, phase, mileage),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['trip_tickets'] });
      void queryClient.invalidateQueries({
        queryKey: ['trip_ticket', variables.ticketId]
      });
      void queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      void queryClient.invalidateQueries({ queryKey: ['reports'] });
      toast.success('Odometer reading recorded');
      setTarget(null);
    },
    onError: (error: Error) => toast.error(error.message)
  });
  if ((!approved || date.status === 'cancelled') && !target) return null;
  const open = (next: 'before' | 'after') => {
    trigger.current = document.activeElement as HTMLElement | null;
    reading.reset();
    const previous = next === 'before' ? date.start_mileage : date.end_mileage;
    setValue(previous === null ? '' : String(previous));
    // A query refresh can move another outing into this card while the dialog
    // is open. Keep the draft attached to the outing the driver selected.
    setTarget({
      ticketId,
      dateId: date.id,
      phase: next,
      startTs: date.start_ts
    });
  };
  const valid =
    value.trim() !== '' &&
    Number.isSafeInteger(Number(value)) &&
    Number(value) >= 0;
  return (
    <div className="border-border mt-4 mb-4 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Gauge className="text-slate size-4" aria-hidden="true" />
          Odometer readings
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {(!date.pre_trip_checked_at || date.start_mileage === null) && (
            <Button
              variant="secondary"
              className="h-11 rounded-[10px] px-3 text-xs"
              aria-label="Before trip odometer"
              onClick={() => open('before')}
            >
              {date.start_mileage === null ? 'Add before' : 'Edit before'}
            </Button>
          )}
          {date.pre_trip_checked_at &&
            (!date.post_trip_checked_at || date.end_mileage === null) && (
              <Button
                variant="secondary"
                className="h-11 rounded-[10px] px-3 text-xs"
                aria-label="After trip odometer"
                onClick={() => open('after')}
              >
                {date.end_mileage === null ? 'Add after' : 'Edit after'}
              </Button>
            )}
        </div>
      </div>
      <p className="text-slate mt-2 text-sm leading-relaxed tabular-nums">
        Before:{' '}
        {date.start_mileage === null
          ? 'Not recorded'
          : `${date.start_mileage.toLocaleString()} km`}{' '}
        · After:{' '}
        {date.end_mileage === null
          ? 'Not recorded'
          : `${date.end_mileage.toLocaleString()} km`}
      </p>
      <p className="text-slate mt-1 text-xs leading-relaxed">
        {date.start_mileage !== null && date.end_mileage !== null
          ? 'Both readings recorded.'
          : 'Missing readings do not prevent a gate scan.'}
      </p>
      <Dialog
        open={phase !== null}
        onOpenChange={(open) => {
          if (!open && !reading.isPending) setTarget(null);
        }}
      >
        <DialogContent
          className="p-5 sm:max-w-md sm:p-6"
          showCloseButton={false}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 size-11"
            disabled={reading.isPending}
            onClick={() => setTarget(null)}
          >
            <X />
            <span className="sr-only">Close</span>
          </Button>
          <DialogHeader>
            <DialogTitle>
              {phase === 'before' ? 'Before trip' : 'After trip'} odometer
            </DialogTitle>
            <DialogDescription>
              Enter whole kilometers shown on the vehicle odometer. Gate scans
              remain available when readings are missing.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (target && valid && !reading.isPending)
                reading.mutate({ ...target, mileage: Number(value) });
            }}
            className="flex min-h-0 flex-col gap-5"
          >
            <DialogBody className="space-y-4">
              <p className="text-slate text-xs leading-relaxed">
                Outing: {target && historyTime(target.startTs)}
              </p>
              <div className="space-y-2">
                <Label htmlFor={`odometer-${target?.dateId ?? date.id}`}>
                  Odometer (km)
                </Label>
                <Input
                  autoFocus
                  className="h-12 text-lg tabular-nums"
                  id={`odometer-${target?.dateId ?? date.id}`}
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  disabled={reading.isPending}
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                />
              </div>
              {reading.error && (
                <p role="alert" className="text-destructive text-sm">
                  {reading.error.message}
                </p>
              )}
            </DialogBody>
            <DialogFooter className="grid grid-cols-2">
              <Button
                type="button"
                variant="outline"
                className="h-12"
                disabled={reading.isPending}
                onClick={() => setTarget(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="h-12"
                disabled={!valid || reading.isPending}
              >
                {reading.isPending ? 'Saving…' : 'Save reading'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
