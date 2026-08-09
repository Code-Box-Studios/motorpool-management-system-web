import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  AlertDialogCancel
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { MultiSelect } from '@/components/ui/multi-select';
import { useAllSpareParts } from '@/lib/query/spare-parts';

interface NoteJobOrderModalProps {
  drivers: Array<{ id: string; full_name: string }> | undefined;
  onSubmit: (data: NoteJobOrderData) => void;
  isLoading: boolean;
  currentSparePartsUsed?: string[];
}

// Body shape for `useNoteJobOrder` (POST /job-orders/:id/note) — spare parts
// are now `{sparePartId, quantity}` pairs instead of the old ids-only array.
export interface NoteJobOrderData {
  assignedMechanicId: string;
  dateOfRequest: string;
  targetDate: string;
  spareParts: { sparePartId: string; quantity: number }[];
}

// Internal form state: the MultiSelect only tracks selected ids, so
// per-part quantities are kept in a side map keyed by sparePartId.
interface NoteJobOrderFormState {
  dateOfRequest: string;
  targetDate: string;
  assignedMechanicId: string;
  selectedSpareParts: string[];
  quantities: Record<string, number>;
}

// Builds a fresh form state, defaulting every pre-selected part's quantity to 1.
function buildInitialState(initialParts: string[]): NoteJobOrderFormState {
  return {
    dateOfRequest: '',
    targetDate: '',
    assignedMechanicId: '',
    selectedSpareParts: initialParts,
    quantities: Object.fromEntries(initialParts.map((id) => [id, 1]))
  };
}

export function NoteJobOrderModal({
  drivers,
  onSubmit,
  isLoading,
  currentSparePartsUsed
}: NoteJobOrderModalProps) {
  const { data: spareParts } = useAllSpareParts();
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState<NoteJobOrderFormState>(() =>
    buildInitialState(currentSparePartsUsed || [])
  );
  const [errors, setErrors] = useState<
    Partial<
      Record<
        'dateOfRequest' | 'targetDate' | 'assignedMechanicId' | 'spareParts',
        string
      >
    >
  >({});

  const validateForm = () => {
    const newErrors: typeof errors = {};

    if (!formData.dateOfRequest) {
      newErrors.dateOfRequest = 'Vehicle Date Accepted is required';
    }
    if (!formData.targetDate) {
      newErrors.targetDate = 'Target Date of Repair is required';
    }
    if (!formData.assignedMechanicId) {
      newErrors.assignedMechanicId = 'Assigned Mechanic is required';
    }

    // Noting the job issues the parts, so a shortage is a hard stop. The server
    // refuses it anyway (409 INSUFFICIENT_STOCK) — this just says so first.
    const short = formData.selectedSpareParts.filter((id) => {
      const onHand = spareParts?.find((p) => p.id === id)?.quantity ?? 0;
      return (formData.quantities[id] ?? 1) > onHand;
    });
    if (short.length > 0) {
      const names = short
        .map((id) => spareParts?.find((p) => p.id === id)?.name ?? 'part')
        .join(', ');
      newErrors.spareParts = `Not enough on the shelf: ${names}`;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validateForm()) return;
    onSubmit({
      assignedMechanicId: formData.assignedMechanicId,
      dateOfRequest: formData.dateOfRequest,
      targetDate: formData.targetDate,
      spareParts: formData.selectedSpareParts.map((sparePartId) => ({
        sparePartId,
        quantity: formData.quantities[sparePartId] ?? 1
      }))
    });
    setOpen(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    // Reset (or re-populate the current spare parts) every time the dialog toggles.
    setFormData(buildInitialState(currentSparePartsUsed || []));
    setErrors({});
  };

  // Keeps the quantities map in sync with the MultiSelect's selection,
  // defaulting any newly-selected part's quantity to 1.
  const handleSparePartsChange = (selected: string[]) => {
    setFormData((prev) => ({
      ...prev,
      selectedSpareParts: selected,
      quantities: Object.fromEntries(
        selected.map((id) => [id, prev.quantities[id] ?? 1])
      )
    }));
  };

  const handleQuantityChange = (sparePartId: string, quantity: number) => {
    setFormData((prev) => ({
      ...prev,
      quantities: { ...prev.quantities, [sparePartId]: quantity }
    }));
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        {/* Fixed width shared with the Mark as Repaired trigger so the
            Actions column lines up whichever transition a row offers. */}
        <Button type="button" variant="default" size="sm" className="w-40">
          Note Job Order
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Note Job Order</AlertDialogTitle>
          <AlertDialogDescription>
            Fill in the required details to note this job order and assign a
            mechanic.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="grid grid-cols-2 gap-4 py-4">
          {/* Vehicle Date Accepted */}
          <Field data-invalid={!!errors.dateOfRequest}>
            <FieldLabel htmlFor="date_of_request">
              Vehicle Date Accepted *
            </FieldLabel>
            <Input
              id="date_of_request"
              type="datetime-local"
              value={formData.dateOfRequest}
              onChange={(e) =>
                setFormData({ ...formData, dateOfRequest: e.target.value })
              }
              aria-invalid={!!errors.dateOfRequest}
            />
            {errors.dateOfRequest && (
              <FieldError errors={[{ message: errors.dateOfRequest }]} />
            )}
          </Field>

          {/* Target Date of Repair */}
          <Field data-invalid={!!errors.targetDate}>
            <FieldLabel htmlFor="target_date">
              Target Date of Repair *
            </FieldLabel>
            <Input
              id="target_date"
              type="datetime-local"
              value={formData.targetDate}
              onChange={(e) =>
                setFormData({ ...formData, targetDate: e.target.value })
              }
              aria-invalid={!!errors.targetDate}
            />
            {errors.targetDate && (
              <FieldError errors={[{ message: errors.targetDate }]} />
            )}
          </Field>

          {/* Assigned Mechanic */}
          <Field
            data-invalid={!!errors.assignedMechanicId}
            className="col-span-2"
          >
            <FieldLabel htmlFor="assigned_mechanic">
              Assigned Mechanic *
            </FieldLabel>
            <Select
              onValueChange={(value) =>
                setFormData({ ...formData, assignedMechanicId: value })
              }
              value={formData.assignedMechanicId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select mechanic" />
              </SelectTrigger>
              <SelectContent>
                {drivers?.map((driver) => (
                  <SelectItem key={driver.id} value={driver.id}>
                    {driver.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.assignedMechanicId && (
              <FieldError errors={[{ message: errors.assignedMechanicId }]} />
            )}
          </Field>

          {/* Spare Parts Used */}
          <Field className="col-span-2">
            <FieldLabel htmlFor="spare_parts_used">Spare Parts Used</FieldLabel>
            <MultiSelect
              options={
                // The shelf count rides in the label. Noting more of a part than
                // exists is refused server-side (409 INSUFFICIENT_STOCK) because
                // the parts are issued here — so show what is actually there
                // rather than let the admin find out by being rejected.
                spareParts?.map((part) => ({
                  value: part.id,
                  label: `${part.name}${part.brand ? ` - ${part.brand}` : ''} · ${part.quantity ?? 0} on hand`
                })) || []
              }
              selected={formData.selectedSpareParts}
              onChange={handleSparePartsChange}
              placeholder="Select spare parts..."
            />
            {errors.spareParts && (
              <FieldError errors={[{ message: errors.spareParts }]} />
            )}
          </Field>

          {/* Per-part quantity (default 1) */}
          {formData.selectedSpareParts.length > 0 && (
            <Field className="col-span-2">
              <FieldLabel>Quantities</FieldLabel>
              <div className="flex flex-col gap-2">
                {formData.selectedSpareParts.map((sparePartId) => {
                  const part = spareParts?.find((p) => p.id === sparePartId);
                  const onHand = part?.quantity ?? 0;
                  const wanted = formData.quantities[sparePartId] ?? 1;
                  const short = wanted > onHand;
                  return (
                    <div key={sparePartId} className="flex items-center gap-3">
                      <span className="flex-1 text-sm">
                        {part?.name || sparePartId}
                        <span className="text-muted-foreground ml-2 text-xs">
                          {onHand} on hand
                        </span>
                      </span>
                      <Input
                        type="number"
                        min={1}
                        // Capped at the shelf: the parts leave stock the moment
                        // this job order is noted, so more than exists is not a
                        // thing that can be committed.
                        max={Math.max(1, onHand)}
                        step={1}
                        className="w-24"
                        aria-invalid={short}
                        value={wanted}
                        onChange={(e) =>
                          handleQuantityChange(
                            sparePartId,
                            Math.max(1, Math.floor(Number(e.target.value)) || 1)
                          )
                        }
                      />
                      {short && (
                        <span className="text-destructive w-28 text-xs">
                          Only {onHand} on the shelf
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </Field>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? 'Submitting...' : 'Submit'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
