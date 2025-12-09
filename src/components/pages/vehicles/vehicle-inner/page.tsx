import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Controller } from 'react-hook-form';
import { useVehicleUpdateForm, type UpdateVehicleFormData } from './actions';
import { useVehicle } from '@/lib/query/vehicles';
import { useUpdateVehicle } from '@/lib/mutation/vehicles';
import { useNavigate } from '@tanstack/react-router';
import { useBranches } from '@/lib/query/shared';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { VEHICLE_STATUS, FUEL_TYPE } from '@/lib/enums';
import { TrashIcon } from 'lucide-react';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious
} from '@/components/ui/carousel';
import { cn } from '@/lib/utils';
import { Loading } from '@/components/ui/loader';

const VehicleInner = ({ vehicleId }: { vehicleId: string }) => {
  const { data: vehicle } = useVehicle(vehicleId);
  const { data: branches, isPending: branchesLoading } = useBranches();
  const updateVehicle = useUpdateVehicle();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [removedImages, setRemovedImages] = useState<string[]>([]);

  const form = useVehicleUpdateForm();

  useEffect(() => {
    if (vehicle && branches) {
      form.reset({
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        license_plate: vehicle.license_plate,
        vin: vehicle.vin,
        status: vehicle.status,
        branch: vehicle.branch || '',
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
    if (vehicle) {
      const { newImages, ...updates } = data;
      updateVehicle.mutate(
        { id: vehicle.id, updates, files: newImages || [], removedImages },
        {
          onSuccess: () => {
            setIsEditing(false);
            setRemovedImages([]);
            navigate({ to: '/vehicles' });
          }
        }
      );
    }
  };

  if (!vehicle || branchesLoading) return <Loading />;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Vehicle Details</h1>
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
      </div>

      <form
        className="flex flex-col justify-center"
        id="edit-vehicle-form"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        {vehicle.images && vehicle.images.length > 0 && (
          <Carousel
            className={cn(
              'mb-11 w-full max-w-md',
              vehicle.images.length > 1 && 'ml-11 cursor-grab'
            )}
          >
            <CarouselContent>
              {vehicle.images
                .filter((url) => !removedImages.includes(url))
                .map((url, index) => (
                  <CarouselItem key={index}>
                    <div className="relative">
                      <img
                        src={url ?? '/logo/mms-logo.png'}
                        alt={`Vehicle image ${index + 1}`}
                        className="aspect-square w-full rounded-lg border bg-white object-contain"
                      />
                      <div>
                        {isEditing && (
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="absolute top-2 right-2 rounded-full p-1"
                            onClick={() =>
                              setRemovedImages((prev) => [...prev, url])
                            }
                          >
                            <TrashIcon className="h-4 w-4" />
                          </Button>
                        )}
                        {/* {isEditing && (
                          <Button
                            type="button"
                            variant="default"
                            size="sm"
                            className="absolute top-2 right-2 rounded-full bg-green-500/50 p-1"
                            onClick={() =>
                              setRemovedImages((prev) => [...prev, url])
                            }
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        )} */}
                      </div>
                    </div>
                  </CarouselItem>
                ))}
            </CarouselContent>
            {vehicle.images.length > 1 && <CarouselPrevious />}
            {vehicle.images.length > 1 && <CarouselNext />}
          </Carousel>
        )}
        {isEditing && (
          <div className="mb-11 grid grid-cols-2 gap-11">
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
            <div />
          </div>
        )}
        <FieldGroup>
          <div className="grid grid-cols-2 gap-11">
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
                    disabled={!isEditing}
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
                    disabled={!isEditing}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
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
                    disabled={!isEditing}
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
                    disabled={!isEditing}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
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
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={!isEditing}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(VEHICLE_STATUS).map((status) => (
                          <SelectItem key={status} value={status}>
                            {status
                              .replace(/_/g, ' ')
                              .replace(/\b\w/g, (l) => l.toUpperCase())}
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
                  value={vehicle.status
                    .replace(/_/g, ' ')
                    .replace(/\b\w/g, (l) => l.toUpperCase())}
                  disabled
                  className="bg-muted"
                />
              </Field>
            )}
            {isEditing ? (
              <Controller
                name="branch"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="branch">Branch *</FieldLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={!isEditing}
                    >
                      <SelectTrigger>
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
            ) : (
              <Field>
                <FieldLabel>Branch</FieldLabel>
                <Input
                  value={
                    branches?.find((b) => b.id === vehicle.branch)?.name || '—'
                  }
                  disabled
                  className="bg-muted"
                />
              </Field>
            )}
            {isEditing ? (
              <Controller
                name="fuel_type"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="fuel_type">Fuel Type *</FieldLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={!isEditing}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select fuel type" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(FUEL_TYPE).map((fuel) => (
                          <SelectItem key={fuel} value={fuel}>
                            {fuel.charAt(0).toUpperCase() +
                              fuel.slice(1).toLowerCase()}
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
                <FieldLabel>Fuel Type</FieldLabel>
                <Input
                  value={
                    vehicle.fuel_type
                      ? vehicle.fuel_type.charAt(0).toUpperCase() +
                        vehicle.fuel_type.slice(1).toLowerCase()
                      : '—'
                  }
                  disabled
                  className="bg-muted"
                />
              </Field>
            )}
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
                    disabled={!isEditing}
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
                    disabled={!isEditing}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
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
                    disabled={!isEditing}
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
              form="edit-vehicle-form"
              disabled={updateVehicle.isPending}
            >
              {updateVehicle.isPending ? 'Updating...' : 'Update Vehicle'}
            </Button>
          </Field>
        )}
      </form>
    </div>
  );
};

export default VehicleInner;
