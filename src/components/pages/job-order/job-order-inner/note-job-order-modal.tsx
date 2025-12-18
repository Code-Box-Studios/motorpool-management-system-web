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
import { useAuth } from '@/hooks/use-auth';

interface NoteJobOrderModalProps {
  drivers: Array<{ id: string; full_name: string }> | undefined;
  onSubmit: (data: NoteJobOrderData) => void;
  isLoading: boolean;
}

export interface NoteJobOrderData {
  date_of_request: string;
  target_date: string;
  assigned_mechanic: string;
  noted_by: string;
  status: 'assigned_mechanic';
}

export function NoteJobOrderModal({
  drivers,
  onSubmit,
  isLoading
}: NoteJobOrderModalProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState<NoteJobOrderData>({
    date_of_request: '',
    target_date: '',
    assigned_mechanic: '',
    noted_by: user?.id || '',
    status: 'assigned_mechanic'
  });
  const [errors, setErrors] = useState<
    Partial<Record<keyof NoteJobOrderData, string>>
  >({});

  const validateForm = () => {
    const newErrors: Partial<Record<keyof NoteJobOrderData, string>> = {};

    if (!formData.date_of_request) {
      newErrors.date_of_request = 'Vehicle Date Accepted is required';
    }
    if (!formData.target_date) {
      newErrors.target_date = 'Target Date of Repair is required';
    }
    if (!formData.assigned_mechanic) {
      newErrors.assigned_mechanic = 'Assigned Mechanic is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (validateForm()) {
      onSubmit({ ...formData, noted_by: user?.id || '' });
      setOpen(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      // Reset form when closing
      setFormData({
        date_of_request: '',
        target_date: '',
        assigned_mechanic: '',
        noted_by: user?.id || '',
        status: 'assigned_mechanic'
      });
      setErrors({});
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="default">
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
          <Field data-invalid={!!errors.date_of_request}>
            <FieldLabel htmlFor="date_of_request">
              Vehicle Date Accepted *
            </FieldLabel>
            <Input
              id="date_of_request"
              type="datetime-local"
              value={formData.date_of_request}
              onChange={(e) =>
                setFormData({ ...formData, date_of_request: e.target.value })
              }
              aria-invalid={!!errors.date_of_request}
            />
            {errors.date_of_request && (
              <FieldError errors={[{ message: errors.date_of_request }]} />
            )}
          </Field>

          {/* Target Date of Repair */}
          <Field data-invalid={!!errors.target_date}>
            <FieldLabel htmlFor="target_date">
              Target Date of Repair *
            </FieldLabel>
            <Input
              id="target_date"
              type="datetime-local"
              value={formData.target_date}
              onChange={(e) =>
                setFormData({ ...formData, target_date: e.target.value })
              }
              aria-invalid={!!errors.target_date}
            />
            {errors.target_date && (
              <FieldError errors={[{ message: errors.target_date }]} />
            )}
          </Field>

          {/* Assigned Mechanic */}
          <Field
            data-invalid={!!errors.assigned_mechanic}
            className="col-span-2"
          >
            <FieldLabel htmlFor="assigned_mechanic">
              Assigned Mechanic *
            </FieldLabel>
            <Select
              onValueChange={(value) =>
                setFormData({ ...formData, assigned_mechanic: value })
              }
              value={formData.assigned_mechanic}
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
            {errors.assigned_mechanic && (
              <FieldError errors={[{ message: errors.assigned_mechanic }]} />
            )}
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
