import { useId, useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAllVehicles } from '@/lib/query/vehicles';

// The dialogs behind a trip ticket's transitions.
//
// Two screens drive the same approval chain — the list, where the status pill
// is a menu, and a single ticket's page, where the same decisions are header
// buttons — and a decision worded one way in the table and another way on the
// record is a decision people stop trusting. The trigger stays with the caller,
// which is what differs; everything from the title down to the body submitted
// lives here, once.
//
// Each dialog owns the fields it collects and clears them as it closes, so a
// reason typed against one ticket can never be submitted against the next.

interface ReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** The textarea's label, e.g. "Cancellation Reason *". */
  label: string;
  placeholder: string;
  confirmLabel: string;
  cancelLabel?: string;
  isLoading?: boolean;
  onConfirm: (reason: string) => void;
}

// Disapproving and cancelling both come down to one required sentence: why.
// Confirm stays disabled until there is one, because that sentence is the only
// explanation the requester will ever get.
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  placeholder,
  confirmLabel,
  cancelLabel = 'Cancel',
  isLoading = false,
  onConfirm
}: ReasonDialogProps) {
  const [reason, setReason] = useState('');
  // Generated, not fixed: the list mounts one of these per transition it
  // offers, and a repeated id would point every label at the first textarea.
  const fieldId = useId();

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setReason('');
    onOpenChange(nextOpen);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-4">
          <Label htmlFor={fieldId} className="mb-2 block">
            {label}
          </Label>
          <Textarea
            id={fieldId}
            placeholder={placeholder}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            className="w-full"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={!reason.trim() || isLoading}
            onClick={() => onConfirm(reason.trim())}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** The trip's own facts, which its fuel allocation is built from. */
export type AllocatableTicket = {
  start_ts?: string | null;
  destination?: string | null;
  purpose?: string | null;
  vehicle_id?: string | null;
};

/** Body of `useApproveTripTicket`, minus the ticket id the caller holds. */
export interface FuelAllocation {
  liters: number;
  fuelType: string;
  date: string;
  purpose: string;
  tripTo: string;
}

interface FuelAllocationDialogProps {
  open: boolean;
  /** The ticket being approved — the trip the allocation covers. */
  ticket: AllocatableTicket | null;
  onOpenChange: (open: boolean) => void;
  isLoading?: boolean;
  onConfirm: (allocation: FuelAllocation) => void;
}

// An admin approves by allocating fuel — the two are one action, which is why
// there is no bare "Approve" anywhere.
export function FuelAllocationDialog({
  open,
  ticket,
  onOpenChange,
  isLoading = false,
  onConfirm
}: FuelAllocationDialogProps) {
  const { data: vehicles } = useAllVehicles();
  const [fuelType, setFuelType] = useState('');
  const [liters, setLiters] = useState('');

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setFuelType('');
      setLiters('');
    }
    onOpenChange(nextOpen);
  };

  // The trip IS the allocation: its date, destination, purpose and vehicle are
  // shown read-only and submitted as they stand. The admin decides only the two
  // things the request cannot know — which fuel, and how much of it.
  //
  // Falls back to today when the ticket has no start_ts, so the required `date`
  // is never sent empty (the server rejects '').
  const date = ticket?.start_ts
    ? ticket.start_ts.split('T')[0]
    : new Date().toISOString().split('T')[0];
  const tripTo = ticket?.destination || '';
  const purpose = ticket?.purpose || '';
  const vehicle = vehicles?.find((v) => v.id === ticket?.vehicle_id);
  const vehicleLabel = vehicle
    ? `${vehicle.make} ${vehicle.model} (${vehicle.license_plate})`
    : (ticket?.vehicle_id ?? '');

  return (
    <AlertDialog open={open && ticket !== null} onOpenChange={handleOpenChange}>
      {/* Widened at sm: on purpose — an unprefixed max-w- would tailwind-merge
          away the content's base max-w-[calc(100%-2rem)] phone gutter and
          still lose to its sm:max-w-lg on desktop. */}
      <AlertDialogContent className="sm:max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Fuel Allocation Details</AlertDialogTitle>
          <AlertDialogDescription>
            Please provide fuel allocation details to submit for EVP Operations
            approval.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="fuel-allocation-date" className="mb-2 block">
                Allocation Date *
              </Label>
              <Input
                id="fuel-allocation-date"
                type="date"
                value={date}
                disabled
                className="bg-muted"
              />
            </div>
            <div>
              <Label htmlFor="fuel-allocation-trip-to" className="mb-2 block">
                Trip To *
              </Label>
              <Input
                id="fuel-allocation-trip-to"
                type="text"
                value={tripTo}
                disabled
                className="bg-muted"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="fuel-allocation-purpose" className="mb-2 block">
              Purpose *
            </Label>
            <Textarea
              id="fuel-allocation-purpose"
              value={purpose}
              disabled
              className="bg-muted"
              rows={3}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="fuel-allocation-vehicle" className="mb-2 block">
                Vehicle *
              </Label>
              <Input
                id="fuel-allocation-vehicle"
                type="text"
                value={vehicleLabel}
                disabled
                className="bg-muted"
              />
            </div>
            <div>
              <Label htmlFor="fuel-allocation-type" className="mb-2 block">
                Fuel Type *
              </Label>
              <Select value={fuelType} onValueChange={setFuelType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select fuel type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gasoline">Gasoline</SelectItem>
                  <SelectItem value="diesel">Diesel</SelectItem>
                  <SelectItem value="electric">Electric</SelectItem>
                  <SelectItem value="hybrid">Hybrid</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="fuel-allocation-liters" className="mb-2 block">
              Liters Required *
            </Label>
            <Input
              id="fuel-allocation-liters"
              type="number"
              min="0"
              step="0.01"
              value={liters}
              onChange={(e) => setLiters(e.target.value)}
              placeholder="Enter liters required"
            />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!fuelType || !(Number(liters) > 0) || isLoading}
            onClick={() =>
              onConfirm({
                liters: Number(liters),
                fuelType,
                date,
                purpose,
                tripTo
              })
            }
          >
            Submit for Fuel Allocation Approval
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
