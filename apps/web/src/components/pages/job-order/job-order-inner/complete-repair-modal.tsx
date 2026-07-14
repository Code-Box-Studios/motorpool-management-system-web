import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import { REPAIR_DONE_TYPE } from '@/lib/enums';

interface CompleteRepairModalProps {
  onSubmit: (data: CompleteRepairData) => void;
  isLoading: boolean;
  /** The odometer already on record — the reading can never be below it. */
  currentMileage: number;
}

// Body shape for `useCompleteRepair` (POST /job-orders/:id/complete-repair) —
// status is dropped, the transition owns it server-side.
export interface CompleteRepairData {
  actualDateOfRelease: string;
  repairDone: string;
  // The odometer the repair was signed off at. The maintenance row this writes
  // is what "last service" means to the risk model, and a row with no odometer
  // reads as a service at 0 km — which is why completing a repair used to make a
  // vehicle look MORE overdue, not less.
  completedMileage: string;
  remarks: string;
}

export function CompleteRepairModal({
  onSubmit,
  isLoading,
  currentMileage
}: CompleteRepairModalProps) {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState<CompleteRepairData>({
    actualDateOfRelease: '',
    repairDone: '',
    completedMileage: '',
    remarks: ''
  });
  const [errors, setErrors] = useState<
    Partial<Record<keyof CompleteRepairData, string>>
  >({});

  // Set default date to current date/time when modal opens
  useEffect(() => {
    if (open) {
      const now = new Date();
      const localDateTime = new Date(
        now.getTime() - now.getTimezoneOffset() * 60000
      )
        .toISOString()
        .slice(0, 16);
      setFormData((prev) => ({
        ...prev,
        actualDateOfRelease: localDateTime
      }));
    }
  }, [open]);

  const validateForm = () => {
    const newErrors: Partial<Record<keyof CompleteRepairData, string>> = {};

    if (!formData.actualDateOfRelease) {
      newErrors.actualDateOfRelease = 'Vehicle Date of Release is required';
    }
    if (!formData.repairDone) {
      newErrors.repairDone = 'Repair Done type is required';
    }

    const reading = Number(formData.completedMileage);
    if (!formData.completedMileage.trim() || !Number.isFinite(reading)) {
      newErrors.completedMileage = 'Odometer reading is required';
    } else if (reading < currentMileage) {
      newErrors.completedMileage = `Cannot be below the vehicle's current ${currentMileage.toLocaleString()} km`;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (validateForm()) {
      onSubmit(formData);
      setOpen(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      // Reset form when closing
      setFormData({
        actualDateOfRelease: '',
        repairDone: '',
        completedMileage: '',
        remarks: ''
      });
      setErrors({});
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="default" size="sm">
          Mark as Repaired
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Complete Repair</AlertDialogTitle>
          <AlertDialogDescription>
            Fill in the details to mark this job order as repaired.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="grid gap-4 py-4">
          {/* Vehicle Date of Release */}
          <Field data-invalid={!!errors.actualDateOfRelease}>
            <FieldLabel htmlFor="actual_date_of_release">
              Vehicle Date of Release *
            </FieldLabel>
            <Input
              id="actual_date_of_release"
              type="datetime-local"
              value={formData.actualDateOfRelease}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  actualDateOfRelease: e.target.value
                })
              }
              aria-invalid={!!errors.actualDateOfRelease}
            />
            {errors.actualDateOfRelease && (
              <FieldError errors={[{ message: errors.actualDateOfRelease }]} />
            )}
          </Field>

          {/* Repair Done */}
          <Field data-invalid={!!errors.repairDone}>
            <FieldLabel htmlFor="repair_done">Repair Done *</FieldLabel>
            <Select
              onValueChange={(value) =>
                setFormData({ ...formData, repairDone: value })
              }
              value={formData.repairDone}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(REPAIR_DONE_TYPE).map(([key, value]) => (
                  <SelectItem key={value} value={value}>
                    {key.charAt(0) + key.slice(1).toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.repairDone && (
              <FieldError errors={[{ message: errors.repairDone }]} />
            )}
          </Field>

          {/* Odometer at sign-off. Nothing else records what the vehicle was
              serviced at, and every maintenance figure is derived from it. */}
          <Field data-invalid={!!errors.completedMileage}>
            <FieldLabel htmlFor="completed_mileage">
              Odometer at completion *
            </FieldLabel>
            <Input
              id="completed_mileage"
              inputMode="numeric"
              placeholder={currentMileage.toLocaleString()}
              value={formData.completedMileage}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  completedMileage: e.target.value.replace(/[^0-9]/g, '')
                })
              }
              aria-invalid={!!errors.completedMileage}
            />
            <p className="text-muted-foreground text-xs">
              Last recorded: {currentMileage.toLocaleString()} km
            </p>
            {errors.completedMileage && (
              <FieldError errors={[{ message: errors.completedMileage }]} />
            )}
          </Field>

          {/* The odometer at sign-off. Nothing else records what the vehicle was
              serviced at, and every maintenance figure is derived from it. */}
          <Field data-invalid={!!errors.completedMileage}>
            <FieldLabel htmlFor="completed_mileage">
              Odometer at completion *
            </FieldLabel>
            <Input
              id="completed_mileage"
              inputMode="numeric"
              placeholder={currentMileage.toLocaleString()}
              value={formData.completedMileage}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  completedMileage: e.target.value.replace(/[^0-9]/g, '')
                })
              }
              aria-invalid={!!errors.completedMileage}
            />
            <p className="text-muted-foreground text-xs">
              Last recorded: {currentMileage.toLocaleString()} km
            </p>
            {errors.completedMileage && (
              <FieldError errors={[{ message: errors.completedMileage }]} />
            )}
          </Field>

          {/* Remarks */}
          <Field>
            <FieldLabel htmlFor="remarks">Remarks</FieldLabel>
            <Textarea
              id="remarks"
              value={formData.remarks}
              onChange={(e) =>
                setFormData({ ...formData, remarks: e.target.value })
              }
              placeholder="Enter remarks"
              rows={3}
            />
          </Field>
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
