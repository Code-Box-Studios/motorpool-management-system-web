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
}

export interface CompleteRepairData {
  actual_date_of_release: string;
  repair_done: string;
  remarks: string;
  status: 'repaired';
}

export function CompleteRepairModal({
  onSubmit,
  isLoading
}: CompleteRepairModalProps) {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState<CompleteRepairData>({
    actual_date_of_release: '',
    repair_done: '',
    remarks: '',
    status: 'repaired'
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
        actual_date_of_release: localDateTime
      }));
    }
  }, [open]);

  const validateForm = () => {
    const newErrors: Partial<Record<keyof CompleteRepairData, string>> = {};

    if (!formData.actual_date_of_release) {
      newErrors.actual_date_of_release = 'Vehicle Date of Release is required';
    }
    if (!formData.repair_done) {
      newErrors.repair_done = 'Repair Done type is required';
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
        actual_date_of_release: '',
        repair_done: '',
        remarks: '',
        status: 'repaired'
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
          <Field data-invalid={!!errors.actual_date_of_release}>
            <FieldLabel htmlFor="actual_date_of_release">
              Vehicle Date of Release *
            </FieldLabel>
            <Input
              id="actual_date_of_release"
              type="datetime-local"
              value={formData.actual_date_of_release}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  actual_date_of_release: e.target.value
                })
              }
              aria-invalid={!!errors.actual_date_of_release}
            />
            {errors.actual_date_of_release && (
              <FieldError
                errors={[{ message: errors.actual_date_of_release }]}
              />
            )}
          </Field>

          {/* Repair Done */}
          <Field data-invalid={!!errors.repair_done}>
            <FieldLabel htmlFor="repair_done">Repair Done *</FieldLabel>
            <Select
              onValueChange={(value) =>
                setFormData({ ...formData, repair_done: value })
              }
              value={formData.repair_done}
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
            {errors.repair_done && (
              <FieldError errors={[{ message: errors.repair_done }]} />
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
