import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useDriver } from '@/lib/query/drivers';
import { useUpdateDriver } from '@/lib/mutation/drivers';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Controller } from 'react-hook-form';
import { useDriverForm, type DriverFormData } from '../add-driver/action';
import { toast } from 'sonner';
import { useEffect, useState } from 'react';
import { FormSkeleton } from '@/components/shared/skeleton/form-skeleton';
import { ConfirmationModal } from '@/components/shared/confirmation-modal';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { DRIVER_STATUS_DB, DRIVER_STATUS_DISPLAY } from '@/lib/enums';
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

const formatDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString() : undefined;

export function DriverDetails({ id }: { id: string }) {
  const { data: driver, isLoading } = useDriver(id);
  const updateDriver = useUpdateDriver();
  const form = useDriverForm();
  const [isEditing, setIsEditing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingData, setPendingData] = useState<DriverFormData | null>(null);

  useBreadcrumbLabel(driver?.full_name);

  useEffect(() => {
    if (driver) {
      form.reset({
        full_name: driver.full_name || '',
        date_of_birth: driver.date_of_birth || '',
        address: driver.address || '',
        phone: driver.phone || '',
        email: driver.email || '',
        license_number: driver.license_number || '',
        license_type: driver.license_type || '',
        license_expiry: driver.license_expiry || '',
        sss_number: driver.sss_number || '',
        tin: driver.tin || '',
        emergency_contact_name: driver.emergency_contact_name || '',
        emergency_contact_phone: driver.emergency_contact_phone || '',
        hire_date: driver.hire_date || '',
        status: driver.status || 'active',
        notes: driver.notes || ''
      });
    }
  }, [driver, form]);

  const onSubmit = (data: DriverFormData) => {
    setPendingData(data);
    setShowConfirm(true);
  };

  const handleConfirmUpdate = () => {
    if (!pendingData) return;
    updateDriver.mutate(
      { id, updates: pendingData },
      {
        onSuccess: () => {
          setIsEditing(false);
          setShowConfirm(false);
          setPendingData(null);
        },
        onError: (error) => {
          toast.error(`Failed to update driver: ${error.message}`);
          setShowConfirm(false);
        }
      }
    );
  };

  if (isLoading) return <FormSkeleton />;
  if (!driver)
    return <div className="text-muted-foreground">Driver not found</div>;

  return (
    <div>
      <RecordHeader
        title={driver.full_name}
        status={driver.status ?? undefined}
        meta={
          driver.license_number ? (
            <span className="font-mono">{driver.license_number}</span>
          ) : undefined
        }
        backTo="/drivers"
        backLabel="Drivers"
        actions={
          // While editing, Save and Cancel live together in the sticky bar at
          // the foot of the form; a Cancel up here would be the same button twice.
          isEditing ? undefined : (
            <Button onClick={() => setIsEditing(true)}>Edit</Button>
          )
        }
      />

      {isEditing ? (
        <form id="update-driver-form" onSubmit={form.handleSubmit(onSubmit)}>
          <FormLayout>
            <FormSection title="Personnel">
              <div className="flex flex-col gap-5">
                <FormRow>
                  <Controller
                    name="full_name"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="full_name">Full Name *</FieldLabel>
                        <Input
                          {...field}
                          id="full_name"
                          type="text"
                          aria-invalid={fieldState.invalid}
                          placeholder="Enter full name"
                          autoComplete="name"
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
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                          <SelectContent>
                            {DRIVER_STATUS_DB.map((status) => (
                              <SelectItem key={status} value={status}>
                                {DRIVER_STATUS_DISPLAY[status]}
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
                    name="phone"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="phone">Phone</FieldLabel>
                        <Input
                          {...field}
                          id="phone"
                          type="tel"
                          aria-invalid={fieldState.invalid}
                          placeholder="Enter phone number"
                          autoComplete="tel"
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                  <Controller
                    name="email"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="email">Email</FieldLabel>
                        <Input
                          {...field}
                          id="email"
                          type="email"
                          aria-invalid={fieldState.invalid}
                          placeholder="Enter email"
                          autoComplete="email"
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
                    name="date_of_birth"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="date_of_birth">
                          Date of Birth
                        </FieldLabel>
                        <Input
                          {...field}
                          id="date_of_birth"
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
                    name="hire_date"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="hire_date">Hire Date</FieldLabel>
                        <Input
                          {...field}
                          id="hire_date"
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
                  name="address"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="address">Address</FieldLabel>
                      <Textarea
                        {...field}
                        id="address"
                        aria-invalid={fieldState.invalid}
                        placeholder="Enter address"
                        rows={3}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
                <Controller
                  name="notes"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="notes">Notes</FieldLabel>
                      <Textarea
                        {...field}
                        id="notes"
                        aria-invalid={fieldState.invalid}
                        placeholder="Additional notes"
                        rows={3}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              </div>
            </FormSection>

            <FormSection title="License">
              <FormRow>
                <Controller
                  name="license_number"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="license_number">
                        License Number *
                      </FieldLabel>
                      <Input
                        {...field}
                        id="license_number"
                        type="text"
                        aria-invalid={fieldState.invalid}
                        placeholder="Enter license number"
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
                <Controller
                  name="license_expiry"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="license_expiry">
                        License Expiry
                      </FieldLabel>
                      <Input
                        {...field}
                        id="license_expiry"
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
            </FormSection>

            <FormActions>
              <Button
                type="submit"
                form="update-driver-form"
                disabled={updateDriver.isPending}
              >
                {updateDriver.isPending ? 'Updating...' : 'Save Details'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditing(false)}
                disabled={updateDriver.isPending}
              >
                Cancel
              </Button>
            </FormActions>
          </FormLayout>
        </form>
      ) : (
        <div className="flex flex-col gap-5">
          <DetailSection title="Personnel">
            <DetailGrid>
              <DetailItem label="Phone" value={driver.phone} />
              <DetailItem label="Email" value={driver.email} />
              <DetailItem
                label="Date of Birth"
                value={formatDate(driver.date_of_birth)}
              />
              <DetailItem
                label="Hire Date"
                value={formatDate(driver.hire_date)}
              />
              <DetailItem
                label="Emergency Contact"
                value={driver.emergency_contact_name}
              />
              <DetailItem
                label="Emergency Contact Phone"
                value={driver.emergency_contact_phone}
              />
              <DetailItem label="SSS Number" value={driver.sss_number} mono />
              <DetailItem label="TIN" value={driver.tin} mono />
              <DetailItem label="Address" value={driver.address} wide />
              <DetailItem label="Notes" value={driver.notes} wide />
            </DetailGrid>
          </DetailSection>

          <DetailSection title="License">
            <DetailGrid>
              <DetailItem
                label="License Number"
                value={driver.license_number}
                mono
              />
              <DetailItem label="License Type" value={driver.license_type} />
              <DetailItem
                label="Expiry"
                value={formatDate(driver.license_expiry)}
              />
            </DetailGrid>
          </DetailSection>
        </div>
      )}

      <ConfirmationModal
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title="Update Driver"
        description="Are you sure you want to save these changes to the driver details?"
        confirmLabel="Save Details"
        loading={updateDriver.isPending}
        onConfirm={handleConfirmUpdate}
        onCancel={() => setPendingData(null)}
      />
    </div>
  );
}
