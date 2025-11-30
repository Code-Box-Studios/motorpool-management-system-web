import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
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
import { Typography } from '@/components/ui/typography';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { DRIVER_STATUS } from '@/lib/enums';

export function DriverDetails({ id }: { id: string }) {
  const { data: driver, isLoading } = useDriver(id);
  const updateDriver = useUpdateDriver();
  const form = useDriverForm();
  const [isEditing, setIsEditing] = useState(false);

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
        status: driver.status || 'Active',
        notes: driver.notes || ''
      });
    }
  }, [driver, form]);

  const onSubmit = (data: DriverFormData) => {
    updateDriver.mutate(
      { id, updates: data },
      {
        onSuccess: () => {
          setIsEditing(false);
        },
        onError: (error) => {
          toast.error(`Failed to update driver: ${error.message}`);
        }
      }
    );
  };

  if (isLoading) return <FormSkeleton />;
  if (!driver) return <div>Driver not found</div>;

  return (
    <div className="">
      <div className="mb-11 flex justify-between">
        <Typography className="text-center" variant={'h1'}>
          Driver Details
        </Typography>
        <Button onClick={() => setIsEditing(!isEditing)}>
          {isEditing ? 'Cancel' : 'Edit'}
        </Button>
      </div>
      <form
        className="flex flex-col justify-center"
        id="update-driver-form"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <FieldGroup>
          <div className="grid grid-cols-2 gap-11">
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
                    disabled={!isEditing}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
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
                    disabled={!isEditing}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
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
                    disabled={!isEditing}
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
                    disabled={!isEditing}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="date_of_birth"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="date_of_birth">Date of Birth</FieldLabel>
                  <Input
                    {...field}
                    id="date_of_birth"
                    type="date"
                    aria-invalid={fieldState.invalid}
                    disabled={!isEditing}
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
                    disabled={!isEditing}
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
                    disabled={!isEditing}
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
                    disabled={!isEditing}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {DRIVER_STATUS.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status}
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
                  disabled={!isEditing}
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
                  disabled={!isEditing}
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
        </FieldGroup>
        {isEditing && (
          <Field className="mt-10 w-fit">
            <Button
              type="submit"
              className="w-fit px-11"
              form="update-driver-form"
              disabled={updateDriver.isPending}
            >
              {updateDriver.isPending ? 'Updating...' : 'Save Details'}
            </Button>
          </Field>
        )}
      </form>
    </div>
  );
}
