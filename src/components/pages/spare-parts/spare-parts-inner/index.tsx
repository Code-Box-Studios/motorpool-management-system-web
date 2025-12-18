import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Controller } from 'react-hook-form';
import {
  useSparePartUpdateForm,
  type UpdateSparePartFormData
} from './actions';
import { useSparePart } from '@/lib/query/spare-parts';
import { useUpdateSparePart } from '@/lib/mutation/spare-parts';
import { useNavigate } from '@tanstack/react-router';
import { TrashIcon } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Loading } from '@/components/ui/loader';

const SparePartsInner = ({ sparePartId }: { sparePartId: string }) => {
  const { data: sparePart } = useSparePart(sparePartId);
  const updateSparePart = useUpdateSparePart();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [removeImage, setRemoveImage] = useState(false);

  const form = useSparePartUpdateForm();

  useEffect(() => {
    if (sparePart) {
      form.reset({
        name: sparePart.name,
        brand: sparePart.brand || '',
        description: sparePart.description || '',
        quantity: sparePart.quantity || 0
      });
    }
  }, [sparePart, form]);

  const onSubmit = (data: UpdateSparePartFormData) => {
    if (sparePart) {
      const { newImage, ...updates } = data;
      updateSparePart.mutate(
        {
          id: sparePart.id,
          updates,
          file: newImage,
          removeImage
        },
        {
          onSuccess: () => {
            setIsEditing(false);
            setRemoveImage(false);
            navigate({ to: '/spare-parts' });
          }
        }
      );
    }
  };

  if (!sparePart) return <Loading />;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Spare Part Details</h1>
        <Button
          onClick={() => {
            setIsEditing(!isEditing);
            if (isEditing) {
              setRemoveImage(false);
            }
          }}
        >
          {isEditing ? 'Cancel' : 'Edit'}
        </Button>
      </div>

      <form
        className="flex flex-col justify-center"
        id="edit-spare-part-form"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        {sparePart.image && !removeImage && (
          <div className="mb-11 w-full max-w-md">
            <div className="relative">
              <img
                src={sparePart.image ?? '/logo/mms-logo.png'}
                alt={sparePart.name}
                className="aspect-square w-full rounded-lg border bg-white object-contain"
              />
              {isEditing && (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="absolute top-2 right-2 rounded-full p-1"
                  onClick={() => setRemoveImage(true)}
                >
                  <TrashIcon className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        )}
        {isEditing && (
          <div className="mb-11 grid grid-cols-2 gap-11">
            <Controller
              name="newImage"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="newImage">
                    {removeImage || !sparePart.image
                      ? 'Add Image'
                      : 'Replace Image'}
                  </FieldLabel>
                  <Input
                    id="newImage"
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      field.onChange(file);
                    }}
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
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="name">Name *</FieldLabel>
                  <Input
                    {...field}
                    id="name"
                    type="text"
                    aria-invalid={fieldState.invalid}
                    placeholder="Enter name"
                    disabled={!isEditing}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="brand"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="brand">Brand</FieldLabel>
                  <Input
                    {...field}
                    id="brand"
                    type="text"
                    aria-invalid={fieldState.invalid}
                    placeholder="Enter brand"
                    disabled={!isEditing}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="quantity"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="quantity">Quantity *</FieldLabel>
                  <Input
                    {...field}
                    id="quantity"
                    type="number"
                    min="0"
                    aria-invalid={fieldState.invalid}
                    placeholder="Enter quantity"
                    disabled={!isEditing}
                    onChange={(e) =>
                      field.onChange(parseInt(e.target.value) || 0)
                    }
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <div />
            <Controller
              name="description"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid} className="col-span-2">
                  <FieldLabel htmlFor="description">Description</FieldLabel>
                  <Textarea
                    {...field}
                    id="description"
                    aria-invalid={fieldState.invalid}
                    placeholder="Enter description"
                    disabled={!isEditing}
                    rows={4}
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
              form="edit-spare-part-form"
              disabled={updateSparePart.isPending}
            >
              {updateSparePart.isPending ? 'Updating...' : 'Update Spare Part'}
            </Button>
          </Field>
        )}
      </form>
    </div>
  );
};

export default SparePartsInner;
