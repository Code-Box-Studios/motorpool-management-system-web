import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import EntityImage from '@/components/shared/entity-image';
import { Controller } from 'react-hook-form';
import { useVehicleUpdateForm, type UpdateVehicleFormData } from './actions';
import type { UpdateVehicle } from '@/lib/types';
import { useVehicle } from '@/lib/query/vehicles';
import { useUpdateVehicle, useDeleteVehicle } from '@/lib/mutation/vehicles';
import { useNavigate } from '@tanstack/react-router';
import { useBranches } from '@/lib/query/shared';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { VEHICLE_STATUS, FUEL_TYPE, USER_ROLES } from '@/lib/enums';
import { TrashIcon } from 'lucide-react';
import { Loading } from '@/components/ui/loader';
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
import { useUserRole } from '@/hooks/use-user-role';
import { VehicleMaintenanceInsights } from './vehicle-maintenance-insights';
import { VehicleTrackerSummary } from './vehicle-tracker-summary';

const titleCase = (value: string) =>
  value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// A missing date must reach DetailItem as undefined, not as a pre-formatted
// dash — DetailItem owns how absence looks.
const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString() : undefined;

const VehicleInner = ({ vehicleId }: { vehicleId: string }) => {
  const { data: vehicle } = useVehicle(vehicleId);
  const { data: branches, isPending: branchesLoading } = useBranches();
  const { data: userRole } = useUserRole();
  const updateVehicle = useUpdateVehicle();
  const deleteVehicle = useDeleteVehicle();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [removedImages, setRemovedImages] = useState<string[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [pendingData, setPendingData] = useState<UpdateVehicleFormData | null>(
    null
  );

  // Removing a vehicle is an admin capability, matching the API's admin-only
  // DELETE — everyone else never sees the action offered.
  const isAdmin = userRole?.roles?.name === USER_ROLES.admin;

  const form = useVehicleUpdateForm();

  useBreadcrumbLabel(vehicle?.license_plate);

  useEffect(() => {
    if (vehicle && branches) {
      form.reset({
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        license_plate: vehicle.license_plate,
        vin: vehicle.vin,
        status: vehicle.status,
        branchId: vehicle.branch || '',
        fuel_type: vehicle.fuel_type || '',
        mileage: vehicle.mileage,
        insurance_expiry: vehicle.insurance_expiry,
        registration_expiry: vehicle.registration_expiry,
        capacity: vehicle.capacity,
        newImages: []
      });
    }
  }, [vehicle, branches, form]);

  const onSubmit = (data: UpdateVehicleFormData) => {
    setPendingData(data);
    setShowConfirm(true);
  };

  const handleConfirmUpdate = () => {
    if (vehicle && pendingData) {
      // The form field is `branchId` (a branch UUID from the <Select>), but
      // the FE's Vehicle row type (and what the adapter sends on) names the
      // column `branch` -- map it explicitly so the value actually reaches the API.
      const { newImages, branchId, ...rest } = pendingData;
      const updates: Omit<UpdateVehicle, 'images'> = {
        ...rest,
        branch: branchId
      };
      updateVehicle.mutate(
        { id: vehicle.id, updates, files: newImages || [], removedImages },
        {
          onSuccess: () => {
            setIsEditing(false);
            setRemovedImages([]);
            setShowConfirm(false);
            setPendingData(null);
            navigate({ to: '/vehicles' });
          }
        }
      );
    }
  };

  // The server refuses a vehicle that is still referenced (409 VEHICLE_IN_USE,
  // "set it out of service instead"); the mutation toasts that message, so the
  // dialog just closes and the record stays put.
  const handleConfirmDelete = () => {
    if (!vehicle) return;
    deleteVehicle.mutate(vehicle.id, {
      onSuccess: () => navigate({ to: '/vehicles' }),
      onSettled: () => setShowDelete(false)
    });
  };

  if (!vehicle || branchesLoading) return <Loading />;

  const branchName = branches?.find((b) => b.id === vehicle.branch)?.name;
  const fuelType = vehicle.fuel_type ? titleCase(vehicle.fuel_type) : undefined;
  const title = [vehicle.make, vehicle.model, vehicle.year]
    .filter(Boolean)
    .join(' ');
  const images = (vehicle.images ?? []).filter(
    (url) => !removedImages.includes(url)
  );

  return (
    <div className="flex flex-col gap-6">
      <RecordHeader
        reference={vehicle.license_plate}
        title={title}
        status={vehicle.status}
        meta={branchName}
        backTo="/vehicles"
        backLabel="Vehicles"
        actions={
          <Button
            onClick={() => {
              setIsEditing(!isEditing);
              if (isEditing) {
                setRemovedImages([]);
              }
            }}
          >
            {isEditing ? 'Cancel' : 'Edit'}
          </Button>
        }
      />

      <div className="grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {images.length > 0 ? (
          images.map((url, index) => (
            <div key={url} className="relative">
              <EntityImage
                src={url}
                alt={`${title} photo ${index + 1}`}
                className="border-border aspect-video w-full rounded-lg border"
              />
              {isEditing && (
                <Button
                  type="button"
                  variant="destructive"
                  size="icon-sm"
                  aria-label={`Remove photo ${index + 1}`}
                  className="absolute top-2 right-2"
                  onClick={() => setRemovedImages((prev) => [...prev, url])}
                >
                  <TrashIcon className="size-4" />
                </Button>
              )}
            </div>
          ))
        ) : (
          <EntityImage
            alt=""
            className="border-border aspect-video w-full rounded-lg border"
          />
        )}
      </div>

      {isEditing ? (
        <form id="edit-vehicle-form" onSubmit={form.handleSubmit(onSubmit)}>
          <FormLayout>
            <FormSection
              title="Specification"
              description="What the vehicle is, and where it belongs."
            >
              <div className="flex flex-col gap-5">
                <FormRow>
                  <Controller
                    name="make"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="make">Make *</FieldLabel>
                        <Input
                          {...field}
                          id="make"
                          type="text"
                          aria-invalid={fieldState.invalid}
                          placeholder="Enter make"
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                  <Controller
                    name="model"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="model">Model *</FieldLabel>
                        <Input
                          {...field}
                          id="model"
                          type="text"
                          aria-invalid={fieldState.invalid}
                          placeholder="Enter model"
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
                    name="year"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="year">Year *</FieldLabel>
                        <Input
                          {...field}
                          id="year"
                          type="number"
                          aria-invalid={fieldState.invalid}
                          placeholder="Enter year"
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                  <Controller
                    name="license_plate"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="license_plate">
                          License Plate *
                        </FieldLabel>
                        <Input
                          {...field}
                          id="license_plate"
                          type="text"
                          aria-invalid={fieldState.invalid}
                          placeholder="Enter license plate"
                          className="font-mono"
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
                    name="vin"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="vin">VIN *</FieldLabel>
                        <Input
                          {...field}
                          id="vin"
                          type="text"
                          aria-invalid={fieldState.invalid}
                          placeholder="Enter VIN"
                          className="font-mono"
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
                          <SelectTrigger id="status">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.values(VEHICLE_STATUS).map((status) => (
                              <SelectItem key={status} value={status}>
                                {titleCase(status)}
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

                <FormRow>
                  <Controller
                    name="branchId"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="branchId">Branch *</FieldLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <SelectTrigger id="branchId">
                            <SelectValue placeholder="Select a branch" />
                          </SelectTrigger>
                          <SelectContent>
                            {branches?.map((branch) => (
                              <SelectItem key={branch.id} value={branch.id}>
                                {branch.name}
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
                    name="fuel_type"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="fuel_type">Fuel Type *</FieldLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <SelectTrigger id="fuel_type">
                            <SelectValue placeholder="Select fuel type" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.values(FUEL_TYPE).map((fuel) => (
                              <SelectItem key={fuel} value={fuel}>
                                {titleCase(fuel.toLowerCase())}
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

                <FormRow>
                  <Controller
                    name="mileage"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="mileage">Mileage *</FieldLabel>
                        <Input
                          {...field}
                          id="mileage"
                          type="number"
                          aria-invalid={fieldState.invalid}
                          placeholder="Enter mileage"
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                  <Controller
                    name="capacity"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="capacity">Capacity *</FieldLabel>
                        <Input
                          {...field}
                          id="capacity"
                          type="number"
                          aria-invalid={fieldState.invalid}
                          placeholder="Enter capacity"
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
                    name="insurance_expiry"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="insurance_expiry">
                          Insurance Expiry *
                        </FieldLabel>
                        <Input
                          {...field}
                          id="insurance_expiry"
                          type="date"
                          aria-invalid={fieldState.invalid}
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                  <Controller
                    name="registration_expiry"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="registration_expiry">
                          Registration Expiry *
                        </FieldLabel>
                        <Input
                          {...field}
                          id="registration_expiry"
                          type="date"
                          aria-invalid={fieldState.invalid}
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

            <FormSection
              title="Photos"
              description="Uploads are added to the existing photos; use the bin on a photo above to drop it."
            >
              <Controller
                name="newImages"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="newImages">Add New Images</FieldLabel>
                    <Input
                      id="newImages"
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={(e) =>
                        field.onChange(Array.from(e.target.files || []))
                      }
                      aria-invalid={fieldState.invalid}
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
                form="edit-vehicle-form"
                disabled={updateVehicle.isPending}
              >
                {updateVehicle.isPending ? 'Updating...' : 'Update Vehicle'}
              </Button>
            </FormActions>
          </FormLayout>
        </form>
      ) : (
        <DetailSection title="Specification">
          <DetailGrid>
            <DetailItem label="Make" value={vehicle.make} />
            <DetailItem label="Model" value={vehicle.model} />
            <DetailItem label="Year" value={vehicle.year} />
            <DetailItem label="Plate" value={vehicle.license_plate} mono />
            <DetailItem label="VIN" value={vehicle.vin} mono />
            <DetailItem label="Branch" value={branchName} />
            <DetailItem label="Fuel Type" value={fuelType} />
            <DetailItem
              label="Mileage"
              value={`${vehicle.mileage.toLocaleString()} km`}
            />
            <DetailItem label="Seats" value={vehicle.capacity} />
            <DetailItem
              label="Insurance Expiry"
              value={formatDate(vehicle.insurance_expiry)}
            />
            <DetailItem
              label="Registration Expiry"
              value={formatDate(vehicle.registration_expiry)}
            />
          </DetailGrid>
        </DetailSection>
      )}

      <ConfirmationModal
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title="Update Vehicle"
        description="Are you sure you want to save these changes to the vehicle details?"
        confirmLabel="Update Vehicle"
        loading={updateVehicle.isPending}
        onConfirm={handleConfirmUpdate}
        onCancel={() => setPendingData(null)}
      />

      <ConfirmationModal
        open={showDelete}
        onOpenChange={setShowDelete}
        title="Delete Vehicle"
        description={`This permanently removes ${title} (${vehicle.license_plate}) from the fleet. This action cannot be undone.`}
        confirmLabel="Delete permanently"
        variant="destructive"
        loading={deleteVehicle.isPending}
        onConfirm={handleConfirmDelete}
      />

      <VehicleMaintenanceInsights vehicleId={vehicleId} />
      <VehicleTrackerSummary vehicleId={vehicleId} />

      {!isEditing && isAdmin && (
        <DetailSection
          title="Danger zone"
          description="Deleting a vehicle is permanent. If it is referenced by trips, job orders or maintenance, set its status to Out of Service instead."
        >
          <Button variant="destructive" onClick={() => setShowDelete(true)}>
            Delete vehicle
          </Button>
        </DetailSection>
      )}
    </div>
  );
};

export default VehicleInner;
