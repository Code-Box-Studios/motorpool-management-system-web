// src/components/pages/tracker-devices/device-details/index.tsx
import { useEffect, useState } from 'react';
import { Controller } from 'react-hook-form';
import { Link, useNavigate } from '@tanstack/react-router';
import { Button, buttonVariants } from '@/components/ui/button';
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
import { Loading } from '@/components/ui/loader';
import { DeviceOnlineIndicator } from '@/components/shared/device-online-indicator';
import { ConfirmationModal } from '@/components/shared/confirmation-modal';
import {
  RecordHeader,
  DetailSection,
  DetailGrid,
  DetailItem
} from '@/components/shared/detail-view';
import {
  FormLayout,
  FormSection,
  FormRow,
  FormActions
} from '@/components/shared/form-section';
import { useBreadcrumbLabel } from '@/hooks/use-breadcrumb';
import { TRACKER_DEVICE_STATUS } from '@mms/shared';
import { cn } from '@/lib/utils';
import {
  titleize,
  vehicleLabel,
  assignedVehicleLabel
} from '@/lib/utils/tracker-devices';
import { useTrackerDevice } from '@/lib/query/tracker-devices';
import {
  useUpdateTrackerDevice,
  useDeleteTrackerDevice
} from '@/lib/mutation/tracker-devices';
import { useVehicle, useAllVehicles } from '@/lib/query/vehicles';
import {
  useTrackerDeviceForm,
  toUpdateBody,
  toFormValues,
  UNASSIGNED_VEHICLE,
  type TrackerDeviceFormData
} from '../action';
import { relativeTime } from '@/lib/utils/relative-time';

const TrackerDeviceInner = ({ deviceId }: { deviceId: string }) => {
  const { data: device, isLoading, error } = useTrackerDevice(deviceId);
  // The whole fleet, unpaginated: a capped page can't offer a vehicle that falls
  // outside it, so the picker would be unable to assign it at all.
  const { data: vehicles, isPending: vehiclesLoading } = useAllVehicles();
  // The assigned vehicle is still read by id rather than reverse-looked-up in
  // the list above — the by-id row is authoritative regardless of that query's
  // cache state.
  const { data: assignedVehicle, isLoading: assignedVehicleLoading } =
    useVehicle(device?.vehicleId ?? '');
  const updateDevice = useUpdateTrackerDevice();
  const deleteDevice = useDeleteTrackerDevice();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [pendingData, setPendingData] = useState<TrackerDeviceFormData | null>(
    null
  );

  const form = useTrackerDeviceForm();

  // A device has no reference code and often no label — the IMEI is what names it.
  useBreadcrumbLabel(device?.imei);

  // Hydrate the form from the server row — but never while the user is editing,
  // or a background refetch (e.g. on window focus) would wipe their in-progress edit.
  useEffect(() => {
    if (device && !isEditing) form.reset(toFormValues(device));
  }, [device, isEditing, form]);

  const onSubmit = (data: TrackerDeviceFormData) => {
    setPendingData(data);
    setShowConfirm(true);
  };

  const handleConfirmUpdate = () => {
    if (!device || !pendingData) return;
    updateDevice.mutate(
      { id: device.id, updates: toUpdateBody(pendingData) },
      {
        onSuccess: () => setIsEditing(false),
        onSettled: () => {
          setShowConfirm(false);
          setPendingData(null);
        }
      }
    );
  };

  const handleConfirmDelete = () => {
    if (!device) return;
    deleteDevice.mutate(device.id, {
      onSuccess: () => navigate({ to: '/tracker-devices' }),
      onSettled: () => setShowDelete(false)
    });
  };

  if (isLoading || vehiclesLoading) return <Loading />;

  // A 404 (stale bookmark, device deleted elsewhere, hand-typed URL) or any load
  // failure must land somewhere — not spin forever on the loader.
  if (error || !device) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Tracker device not found</h1>
        <p className="text-muted-foreground">
          {error
            ? `Error loading device: ${error.message}`
            : 'This device no longer exists or the link is invalid.'}
        </p>
        <Link to="/tracker-devices" className={cn(buttonVariants())}>
          Back to Tracker Devices
        </Link>
      </div>
    );
  }

  const assignedLabel = assignedVehicleLabel(
    device.vehicleId,
    assignedVehicle,
    assignedVehicleLoading
  );

  const lastSeen = device.lastSeenAt ? new Date(device.lastSeenAt) : null;
  const lastSeenValue =
    lastSeen && !Number.isNaN(lastSeen.getTime()) ? (
      <span className="flex flex-col">
        <span>{relativeTime(lastSeen)}</span>
        <span className="text-muted-foreground text-xs font-normal">
          {lastSeen.toLocaleString()}
        </span>
      </span>
    ) : undefined;

  const deleteAction = (
    <Button variant="destructive" size="sm" onClick={() => setShowDelete(true)}>
      Delete permanently
    </Button>
  );

  return (
    // Cap the record to a comfortable, centred column so a device's few facts
    // read as one card rather than spread across the full 1600px shell.
    <div className="mx-auto w-full max-w-4xl">
      <RecordHeader
        reference={device.imei}
        title={device.label?.trim() || 'Tracker device'}
        status={device.status}
        meta={
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            <DeviceOnlineIndicator lastSeenAt={device.lastSeenAt} />
            <span aria-hidden="true">·</span>
            <span>{assignedLabel}</span>
          </span>
        }
        backTo="/tracker-devices"
        backLabel="Tracker Devices"
        actions={
          isEditing ? (
            deleteAction
          ) : (
            <>
              {deleteAction}
              <Button onClick={() => setIsEditing(true)}>Edit</Button>
            </>
          )
        }
      />

      {isEditing ? (
        <form id="edit-device-form" onSubmit={form.handleSubmit(onSubmit)}>
          <FormLayout>
            <FormSection title="Device">
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
                          placeholder="Enter IMEI"
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
                          placeholder="Label"
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
                          placeholder="SIM number"
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
                        <FieldLabel htmlFor="status">Status</FieldLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.values(TRACKER_DEVICE_STATUS).map(
                              (status) => (
                                <SelectItem key={status} value={status}>
                                  {titleize(status)}
                                </SelectItem>
                              )
                            )}
                          </SelectContent>
                        </Select>
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                </FormRow>
              </div>
            </FormSection>

            <FormSection
              title="Assignment"
              description="The vehicle this device reports positions for."
            >
              <div className="flex flex-col gap-5">
                <FormRow>
                  <Controller
                    name="vehicleId"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="vehicleId">
                          Assigned Vehicle
                        </FieldLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select vehicle" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={UNASSIGNED_VEHICLE}>
                              Unassigned
                            </SelectItem>
                            {vehicles?.map((v) => (
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
                        placeholder="Notes"
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              </div>
            </FormSection>

            <FormActions>
              <Button
                type="submit"
                form="edit-device-form"
                disabled={updateDevice.isPending}
              >
                {updateDevice.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditing(false)}
              >
                Cancel
              </Button>
            </FormActions>
          </FormLayout>
        </form>
      ) : (
        <div className="flex flex-col gap-5">
          <DetailSection title="Device">
            {/* Status is not repeated here: the header already carries it as a
                badge, and the same fact twice on one screen reads as two. */}
            <DetailGrid>
              <DetailItem label="IMEI" value={device.imei} mono />
              <DetailItem label="SIM Number" value={device.simNumber} mono />
              <DetailItem label="Label" value={device.label} />
              <DetailItem label="Last Seen" value={lastSeenValue} />
            </DetailGrid>
          </DetailSection>

          <DetailSection
            title="Assignment"
            description="The vehicle this device reports positions for."
          >
            <DetailGrid>
              <DetailItem label="Assigned Vehicle" value={assignedLabel} />
              <DetailItem label="Notes" value={device.notes} wide />
            </DetailGrid>
          </DetailSection>
        </div>
      )}

      <ConfirmationModal
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title="Update Tracker Device"
        description="Are you sure you want to save these changes?"
        confirmLabel="Save Changes"
        loading={updateDevice.isPending}
        onConfirm={handleConfirmUpdate}
        onCancel={() => setPendingData(null)}
      />

      <ConfirmationModal
        open={showDelete}
        onOpenChange={setShowDelete}
        title="Delete Tracker Device"
        description="This permanently removes the device record and its history. This action cannot be undone. To retire the device while keeping its record, set its status to Decommissioned instead."
        confirmLabel="Delete permanently"
        variant="destructive"
        loading={deleteDevice.isPending}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
};

export default TrackerDeviceInner;
