// src/components/pages/tracker-devices/add-device/index.tsx
import { useState } from 'react';
import { Controller } from 'react-hook-form';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
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
import PageHeader from '@/components/shared/page-header';
import {
  FormLayout,
  FormSection,
  FormRow,
  FormActions
} from '@/components/shared/form-section';
import { useCreateTrackerDevice } from '@/lib/mutation/tracker-devices';
import { useVehicles } from '@/lib/query/vehicles';
import { titleize, vehicleLabel } from '@/lib/utils/tracker-devices';
import {
  useTrackerDeviceForm,
  toCreateBody,
  UNASSIGNED_VEHICLE,
  type TrackerDeviceFormData
} from '../action';

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
      <PageHeader
        title="Register Tracker Device"
        description="Register a GPS tracker and optionally assign it to a vehicle."
      />

      <form id="add-device-form" onSubmit={form.handleSubmit(onSubmit)}>
        <FormLayout>
          <FormSection
            title="The device"
            description="How the tracker identifies itself on the network."
          >
            <div className="flex flex-col gap-5">
              <FormRow>
                <Controller
                  name="imei"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="imei">IMEI *</FieldLabel>
                      <Input
                        {...field}
                        id="imei"
                        className="font-mono"
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
                  name="simNumber"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="simNumber">SIM Number</FieldLabel>
                      <Input
                        {...field}
                        id="simNumber"
                        className="font-mono"
                        aria-invalid={fieldState.invalid}
                        placeholder="Enter SIM number"
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              </FormRow>

              <FormRow>
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
              </FormRow>
            </div>
          </FormSection>

          <FormSection title="Assignment">
            <FormRow>
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
                    <FieldLabel htmlFor="vehicleId">
                      Assigned Vehicle
                    </FieldLabel>
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
                            {vehicleLabel(v)}
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
            </FormRow>
          </FormSection>

          <FormSection title="Anything else">
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
          </FormSection>

          <FormActions>
            <Button
              type="submit"
              form="add-device-form"
              disabled={createDevice.isPending}
            >
              {createDevice.isPending ? 'Registering...' : 'Register Device'}
            </Button>
          </FormActions>
        </FormLayout>
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
