// src/components/pages/tracker-devices/add-device/index.tsx
import { useState } from 'react';
import { Controller } from 'react-hook-form';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import {
  FieldGroup,
  Field,
  FieldError,
  FieldLabel
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { TRACKER_DEVICE_STATUS } from '@mms/shared';
import { ConfirmationModal } from '@/components/shared/confirmation-modal';
import { useCreateTrackerDevice } from '@/lib/mutation/tracker-devices';
import { useVehicles } from '@/lib/query/vehicles';
import {
  useTrackerDeviceForm,
  toCreateBody,
  UNASSIGNED_VEHICLE,
  type TrackerDeviceFormData
} from '../action';

// Titleize a status enum value ('active' -> 'Active').
const titleize = (s: string) => s.replace(/\b\w/g, (l) => l.toUpperCase());

export function AddTrackerDevice() {
  const navigate = useNavigate();
  const createDevice = useCreateTrackerDevice();
  const form = useTrackerDeviceForm();
  const { data: vehicles } = useVehicles(1, 200);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingData, setPendingData] = useState<TrackerDeviceFormData | null>(
    null
  );

  const onSubmit = (data: TrackerDeviceFormData) => {
    setPendingData(data);
    setShowConfirm(true);
  };

  const handleConfirmAdd = () => {
    if (!pendingData) return;
    createDevice.mutate(toCreateBody(pendingData), {
      onSuccess: () => navigate({ to: '/tracker-devices' }),
      onSettled: () => {
        setShowConfirm(false);
        setPendingData(null);
      }
    });
  };

  return (
    <div>
      <form
        className="flex flex-col justify-center p-11 md:p-13"
        id="add-device-form"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <FieldGroup>
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold">Register Tracker Device</h1>
            <p className="text-muted-foreground text-balance">
              Register a GPS tracker and optionally assign it to a vehicle.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-11">
            <Controller
              name="imei"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="imei">IMEI *</FieldLabel>
                  <Input
                    {...field}
                    id="imei"
                    aria-invalid={fieldState.invalid}
                    placeholder="Enter device IMEI"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="label"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="label">Label</FieldLabel>
                  <Input
                    {...field}
                    id="label"
                    aria-invalid={fieldState.invalid}
                    placeholder="e.g. Fleet unit 12"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="simNumber"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="simNumber">SIM Number</FieldLabel>
                  <Input
                    {...field}
                    id="simNumber"
                    aria-invalid={fieldState.invalid}
                    placeholder="Enter SIM number"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="status"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="status">Status *</FieldLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(TRACKER_DEVICE_STATUS).map((status) => (
                        <SelectItem key={status} value={status}>
                          {titleize(status)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="vehicleId"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="vehicleId">Assigned Vehicle</FieldLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select vehicle" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED_VEHICLE}>
                        Unassigned
                      </SelectItem>
                      {vehicles?.data?.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.make} {v.model} — {v.license_plate}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </div>
          <Controller
            name="notes"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="notes">Notes</FieldLabel>
                <Textarea
                  {...field}
                  id="notes"
                  rows={4}
                  aria-invalid={fieldState.invalid}
                  placeholder="Optional notes"
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
        </FieldGroup>

        <Field className="mt-10 w-fit">
          <Button
            type="submit"
            className="w-fit px-11"
            form="add-device-form"
            disabled={createDevice.isPending}
          >
            {createDevice.isPending ? 'Registering...' : 'Register Device'}
          </Button>
        </Field>
      </form>

      <ConfirmationModal
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title="Register Tracker Device"
        description="Are you sure you want to register this tracker device?"
        confirmLabel="Register Device"
        loading={createDevice.isPending}
        onConfirm={handleConfirmAdd}
        onCancel={() => setPendingData(null)}
      />
    </div>
  );
}
