// src/components/pages/tracker-devices/device-details/index.tsx
import { useEffect, useState } from 'react';
import { Controller } from 'react-hook-form';
import { Link, useNavigate } from '@tanstack/react-router';
import { Button, buttonVariants } from '@/components/ui/button';
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
import { Loading } from '@/components/ui/loader';
import StatusBadge from '@/components/shared/status-badge';
import { DeviceOnlineIndicator } from '@/components/shared/device-online-indicator';
import { ConfirmationModal } from '@/components/shared/confirmation-modal';
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
import { useVehicle, useVehicles } from '@/lib/query/vehicles';
import {
  useTrackerDeviceForm,
  toUpdateBody,
  toFormValues,
  UNASSIGNED_VEHICLE,
  type TrackerDeviceFormData
} from '../action';

const TrackerDeviceInner = ({ deviceId }: { deviceId: string }) => {
  const { data: device, isLoading, error } = useTrackerDevice(deviceId);
  const { data: vehicles, isPending: vehiclesLoading } = useVehicles(1, 200);
  // The assigned vehicle is read by id, not reverse-looked-up in the paginated
  // list above — that list can't be trusted to contain it (page size, shared cache).
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

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Tracker Device</h1>
          <StatusBadge status={device.status} />
          <DeviceOnlineIndicator lastSeenAt={device.lastSeenAt} />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowDelete(true)}
          >
            Delete permanently
          </Button>
          <Button onClick={() => setIsEditing(!isEditing)}>
            {isEditing ? 'Cancel' : 'Edit'}
          </Button>
        </div>
      </div>

      <form
        className="flex flex-col justify-center"
        id="edit-device-form"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <FieldGroup>
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
                    placeholder="Enter IMEI"
                    disabled={!isEditing}
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
                    disabled={!isEditing}
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
                    placeholder="SIM number"
                    disabled={!isEditing}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            {isEditing ? (
              <Controller
                name="status"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="status">Status</FieldLabel>
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
            ) : (
              <Field>
                <FieldLabel>Status</FieldLabel>
                <Input
                  value={titleize(device.status)}
                  disabled
                  className="bg-muted"
                />
              </Field>
            )}

            {isEditing ? (
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
            ) : (
              <Field>
                <FieldLabel>Assigned Vehicle</FieldLabel>
                <Input value={assignedLabel} disabled className="bg-muted" />
              </Field>
            )}

            <Controller
              name="notes"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid} className="col-span-2">
                  <FieldLabel htmlFor="notes">Notes</FieldLabel>
                  <Textarea
                    {...field}
                    id="notes"
                    rows={4}
                    aria-invalid={fieldState.invalid}
                    placeholder="Notes"
                    disabled={!isEditing}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </div>
        </FieldGroup>

        {isEditing && (
          <Field className="mt-10 w-fit">
            <Button
              type="submit"
              className="w-fit px-11"
              form="edit-device-form"
              disabled={updateDevice.isPending}
            >
              {updateDevice.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </Field>
        )}
      </form>

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
