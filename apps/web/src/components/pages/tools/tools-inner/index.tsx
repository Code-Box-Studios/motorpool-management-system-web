import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Controller } from 'react-hook-form';
import { useToolUpdateForm, type UpdateToolFormData } from './actions';
import { useTool } from '@/lib/query/tools';
import { useUpdateTool } from '@/lib/mutation/tools';
import { useNavigate } from '@tanstack/react-router';
import { useDrivers } from '@/lib/query/drivers';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { TOOL_STATUS } from '@/lib/enums';
import { TrashIcon } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Loading } from '@/components/ui/loader';
import { ConfirmationModal } from '@/components/shared/confirmation-modal';

const ToolsInner = ({ toolId }: { toolId: string }) => {
  const { data: tool } = useTool(toolId);
  const { data: drivers, isPending: driversLoading } = useDrivers(1, 100);
  const updateTool = useUpdateTool();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [removeImage, setRemoveImage] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingData, setPendingData] = useState<UpdateToolFormData | null>(
    null
  );

  const form = useToolUpdateForm();

  useEffect(() => {
    if (tool && drivers) {
      form.reset({
        name: tool.name,
        description: tool.description || '',
        status: tool.status || 'available',
        borrowed_by: tool.borrowed_by || '',
        borrowed_date: tool.borrowed_date || '',
        estimated_return_date: tool.estimated_return_date || ''
      });
    }
  }, [tool, drivers, form]);

  const onSubmit = (data: UpdateToolFormData) => {
    setPendingData(data);
    setShowConfirm(true);
  };

  const handleConfirmUpdate = () => {
    if (tool && pendingData) {
      const { newImage, ...updates } = pendingData;
      updateTool.mutate(
        {
          id: tool.id,
          updates,
          file: newImage,
          removeImage
        },
        {
          onSuccess: () => {
            setIsEditing(false);
            setRemoveImage(false);
            setShowConfirm(false);
            setPendingData(null);
            navigate({ to: '/tools' });
          }
        }
      );
    }
  };

  if (!tool || driversLoading) return <Loading />;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tool Details</h1>
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
        id="edit-tool-form"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        {tool.image && !removeImage && (
          <div className="mb-11 w-full max-w-md">
            <div className="relative">
              <img
                src={tool.image ?? '/logo/mms-logo.png'}
                alt={tool.name}
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
                    {removeImage || !tool.image ? 'Add Image' : 'Replace Image'}
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
                        {Object.values(TOOL_STATUS).map((status) => (
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
                  value={(tool.status || 'available')
                    .replace(/_/g, ' ')
                    .replace(/\b\w/g, (l) => l.toUpperCase())}
                  disabled
                  className="bg-muted"
                />
              </Field>
            )}
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
            {isEditing ? (
              <Controller
                name="borrowed_by"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="borrowed_by">Borrowed By</FieldLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={!isEditing}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a driver" />
                      </SelectTrigger>
                      <SelectContent>
                        {drivers?.data?.map((driver) => (
                          <SelectItem key={driver.id} value={driver.id}>
                            {driver.full_name}
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
                <FieldLabel>Borrowed By</FieldLabel>
                <Input
                  value={
                    drivers?.data?.find((d) => d.id === tool.borrowed_by)
                      ?.full_name || '—'
                  }
                  disabled
                  className="bg-muted"
                />
              </Field>
            )}
            <Controller
              name="borrowed_date"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="borrowed_date">Borrowed Date</FieldLabel>
                  <Input
                    {...field}
                    id="borrowed_date"
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
              name="estimated_return_date"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="estimated_return_date">
                    Estimated Return Date
                  </FieldLabel>
                  <Input
                    {...field}
                    id="estimated_return_date"
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
              form="edit-tool-form"
              disabled={updateTool.isPending}
            >
              {updateTool.isPending ? 'Updating...' : 'Update Tool'}
            </Button>
          </Field>
        )}
      </form>

      <ConfirmationModal
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title="Update Tool"
        description="Are you sure you want to save these changes to the tool?"
        confirmLabel="Update Tool"
        loading={updateTool.isPending}
        onConfirm={handleConfirmUpdate}
        onCancel={() => setPendingData(null)}
      />
    </div>
  );
};

export default ToolsInner;
