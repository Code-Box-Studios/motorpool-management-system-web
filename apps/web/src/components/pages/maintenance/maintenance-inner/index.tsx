import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Controller } from 'react-hook-form';
import {
  useMaintenanceForm,
  useUpdateMaintenanceAction,
  type MaintenanceFormData
} from './actions';
import { useParams, useNavigate, useSearch } from '@tanstack/react-router';
import { useMaintenance } from '@/lib/query/maintenance';
import { useAllVehicles } from '@/lib/query/vehicles';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { MAINTENANCE_TYPE } from '@/lib/enums';
import { Textarea } from '@/components/ui/textarea';
import { useCallback, useEffect, useState } from 'react';
import { ConfirmationModal } from '@/components/shared/confirmation-modal';
import { FormSkeleton } from '@/components/shared/skeleton/form-skeleton';
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

const titleCase = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);

const formatDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString() : undefined;

export function MaintenanceInner() {
  const { id } = useParams({ from: '/_authenticated/maintenance/$id' });
  // The table's pencil links here with ?edit — the eye links here without it.
  const { edit } = useSearch({ strict: false }) as { edit?: boolean };
  const { data: maintenance, isLoading: isLoadingMaintenance } = useMaintenance(
    id as string
  );
  // The whole fleet, not a page of it: the lookup below and the edit-mode
  // picker both have to resolve any vehicle, however old the record is.
  const { data: vehicles, isLoading: isLoadingVehicles } = useAllVehicles();
  const updateMaintenanceAction = useUpdateMaintenanceAction(id as string);
  const form = useMaintenanceForm();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(Boolean(edit));
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingData, setPendingData] = useState<MaintenanceFormData | null>(
    null
  );

  const vehicle = vehicles?.find((v) => v.id === maintenance?.vehicle_id);

  // A maintenance row has no reference code of its own, so it is named by the
  // vehicle it was for — falling back to its date.
  useBreadcrumbLabel(vehicle?.license_plate ?? formatDate(maintenance?.date));

  const resetFromRecord = useCallback(() => {
    if (!maintenance) return;
    form.reset({
      vehicle_id: maintenance.vehicle_id || '',
      date: maintenance.date || '',
      type: (maintenance.type as MaintenanceFormData['type']) || 'preventive',
      description: maintenance.description || '',
      cost: maintenance.cost !== null ? String(maintenance.cost) : '',
      mileage: maintenance.mileage !== null ? String(maintenance.mileage) : '',
      next_due: maintenance.next_due || ''
    });
  }, [maintenance, form]);

  useEffect(() => {
    resetFromRecord();
  }, [resetFromRecord]);

  const onSubmit = (data: MaintenanceFormData) => {
    setPendingData(data);
    setShowConfirm(true);
  };

  const handleConfirmUpdate = () => {
    if (!pendingData) return;
    const transformedData = {
      ...pendingData,
      cost: pendingData.cost === '' ? null : Number(pendingData.cost),
      mileage: pendingData.mileage === '' ? null : Number(pendingData.mileage),
      next_due: pendingData.next_due === '' ? null : pendingData.next_due
    };
    updateMaintenanceAction
      .updateMaintenanceAction(transformedData)
      .then(() => {
        setShowConfirm(false);
        setPendingData(null);
        navigate({ to: '/maintenance' });
      })
      .catch((error) => {
        console.error('Error updating maintenance:', error);
        setShowConfirm(false);
      });
  };

  const handleCancelEdit = () => {
    resetFromRecord();
    setIsEditing(false);
  };

  if (isLoadingMaintenance || isLoadingVehicles) {
    return <FormSkeleton />;
  }

  if (!id) {
    return <div className="text-muted-foreground">Invalid maintenance ID</div>;
  }

  if (!maintenance) {
    return (
      <div className="text-muted-foreground">Maintenance record not found</div>
    );
  }

  const vehicleName = vehicle ? `${vehicle.make} ${vehicle.model}` : undefined;

  return (
    <div>
      <RecordHeader
        title={titleCase(maintenance.type)}
        meta={
          vehicle ? (
            <>
              {vehicleName} ·{' '}
              <span className="font-mono">{vehicle.license_plate}</span>
            </>
          ) : (
            'Unassigned vehicle'
          )
        }
        backTo="/maintenance"
        backLabel="Maintenance"
        actions={
          // While editing, Save and Cancel live together in the sticky bar at
          // the foot of the form; a Cancel up here would be the same button twice.
          isEditing ? undefined : (
            <Button onClick={() => setIsEditing(true)}>Edit</Button>
          )
        }
      />

      {isEditing ? (
        <form
          id="update-maintenance-form"
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <FormLayout>
            <FormSection
              title="Maintenance details"
              description="Update the maintenance details below."
            >
              <div className="flex flex-col gap-5">
                <FormRow>
                  <Controller
                    name="vehicle_id"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="vehicle_id">Vehicle *</FieldLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select a vehicle" />
                          </SelectTrigger>
                          <SelectContent>
                            {vehicles?.map((v) => (
                              <SelectItem key={v.id} value={v.id}>
                                {v.make} {v.model} - {v.license_plate}
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
                    name="date"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="date">Date *</FieldLabel>
                        <Input
                          {...field}
                          id="date"
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
                <FormRow>
                  <Controller
                    name="type"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="type">Type *</FieldLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.values(MAINTENANCE_TYPE).map((type) => (
                              <SelectItem key={type} value={type}>
                                {titleCase(type)}
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
                    name="cost"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="cost">Cost</FieldLabel>
                        <Input
                          {...field}
                          id="cost"
                          type="number"
                          step="0.01"
                          aria-invalid={fieldState.invalid}
                          placeholder="Enter cost"
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
                    name="mileage"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="mileage">Mileage</FieldLabel>
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
                    name="next_due"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="next_due">
                          Next Due Date
                        </FieldLabel>
                        <Input
                          {...field}
                          id="next_due"
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
                <Controller
                  name="description"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="description">Description</FieldLabel>
                      <Textarea
                        {...field}
                        id="description"
                        aria-invalid={fieldState.invalid}
                        placeholder="Enter maintenance description"
                        rows={4}
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
                form="update-maintenance-form"
                disabled={updateMaintenanceAction.isLoading}
              >
                {updateMaintenanceAction.isLoading
                  ? 'Updating...'
                  : 'Update Maintenance'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleCancelEdit}
                disabled={updateMaintenanceAction.isLoading}
              >
                Cancel
              </Button>
            </FormActions>
          </FormLayout>
        </form>
      ) : (
        <DetailSection title="Maintenance">
          <DetailGrid>
            <DetailItem label="Vehicle" value={vehicleName} />
            <DetailItem label="Plate" value={vehicle?.license_plate} mono />
            <DetailItem label="Type" value={titleCase(maintenance.type)} />
            <DetailItem label="Date" value={formatDate(maintenance.date)} />
            <DetailItem
              label="Mileage"
              value={
                maintenance.mileage !== null
                  ? `${maintenance.mileage.toLocaleString()} km`
                  : undefined
              }
            />
            <DetailItem
              label="Cost"
              value={
                maintenance.cost !== null
                  ? `$${maintenance.cost.toFixed(2)}`
                  : undefined
              }
            />
            <DetailItem
              label="Next Due"
              value={formatDate(maintenance.next_due)}
            />
            <DetailItem
              label="Description"
              value={maintenance.description}
              wide
            />
          </DetailGrid>
        </DetailSection>
      )}

      <ConfirmationModal
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title="Update Maintenance Record"
        description="Are you sure you want to save these changes to the maintenance record?"
        confirmLabel="Update Maintenance"
        loading={updateMaintenanceAction.isLoading}
        onConfirm={handleConfirmUpdate}
        onCancel={() => setPendingData(null)}
      />
    </div>
  );
}

export default MaintenanceInner;
