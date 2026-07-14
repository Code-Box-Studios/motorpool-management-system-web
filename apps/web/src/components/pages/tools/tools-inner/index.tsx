import { useEffect, useState } from 'react';
import { Controller } from 'react-hook-form';
import { useNavigate } from '@tanstack/react-router';
import { TrashIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Loading } from '@/components/ui/loader';
import { ConfirmationModal } from '@/components/shared/confirmation-modal';
import StatusBadge from '@/components/shared/status-badge';
import EntityImage from '@/components/shared/entity-image';
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
import { useToolUpdateForm, type UpdateToolFormData } from './actions';
import { useTool } from '@/lib/query/tools';
import { useUpdateTool } from '@/lib/mutation/tools';
import { useDrivers } from '@/lib/query/drivers';
import { TOOL_STATUS } from '@/lib/enums';
import { resolveStatus } from '@/lib/status';

// Borrow dates are `@db.Date` (YYYY-MM-DD). `new Date('2026-07-14')` parses as
// UTC midnight and renders as the day before west of Greenwich, so the parts are
// fed to a local Date instead.
const formatDay = (value?: string | null) => {
  if (!value) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

// Row timestamps are full ISO instants, so they can go straight through Date.
const formatDateTime = (value?: string | null) => {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

// Today in the same YYYY-MM-DD shape the API stores, so a due date can be
// compared as a plain string without a timezone shifting it across midnight.
const localToday = () => {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('-');
};

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

  useBreadcrumbLabel(tool?.name);

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

  const cancelEditing = () => {
    setIsEditing(false);
    setRemoveImage(false);
  };

  if (!tool || driversLoading) return <Loading />;

  const status = tool.status || 'available';
  const borrowedByName = drivers?.data?.find(
    (d) => d.id === tool.borrowed_by
  )?.full_name;
  // Borrow state lives on the tool row itself (no borrow-request entity): a tool
  // is out when any of those columns is set, and returning it clears them.
  const isBorrowed = Boolean(
    tool.borrowed_by ||
      tool.borrowed_date ||
      tool.estimated_return_date ||
      status === TOOL_STATUS.BORROWED
  );
  const overdue = Boolean(
    tool.estimated_return_date && tool.estimated_return_date < localToday()
  );

  const dueBack = tool.estimated_return_date ? (
    <span className="inline-flex flex-wrap items-center gap-2">
      {formatDay(tool.estimated_return_date)}
      {overdue && <StatusBadge status="overdue" />}
    </span>
  ) : undefined;

  return (
    <div>
      <RecordHeader
        title={tool.name}
        status={status}
        meta={
          isBorrowed
            ? borrowedByName
              ? `Signed out to ${borrowedByName}`
              : 'Signed out'
            : undefined
        }
        backTo="/tools"
        backLabel="Tools"
        actions={
          isEditing ? undefined : (
            <Button onClick={() => setIsEditing(true)}>Edit</Button>
          )
        }
      />

      {isEditing ? (
        <form id="edit-tool-form" onSubmit={form.handleSubmit(onSubmit)}>
          <FormLayout>
            <FormSection title="Tool">
              <div className="flex flex-col gap-5">
                <FormRow>
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
                            {Object.values(TOOL_STATUS).map((toolStatus) => (
                              <SelectItem key={toolStatus} value={toolStatus}>
                                {resolveStatus(toolStatus).label}
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
                  name="description"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="description">Description</FieldLabel>
                      <Textarea
                        {...field}
                        id="description"
                        aria-invalid={fieldState.invalid}
                        placeholder="Enter description"
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

            <FormSection title="Photo">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                {tool.image && !removeImage && (
                  <div className="relative w-full max-w-[220px] shrink-0">
                    <img
                      src={tool.image}
                      alt={tool.name}
                      className="border-border bg-muted aspect-square w-full rounded-[20px] border object-contain"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="absolute top-2 right-2 rounded-full p-1"
                      onClick={() => setRemoveImage(true)}
                    >
                      <TrashIcon className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                <Controller
                  name="newImage"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid} className="flex-1">
                      <FieldLabel htmlFor="newImage">
                        {removeImage || !tool.image
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
              </div>
            </FormSection>

            <FormSection
              title="Borrowing"
              description="Signing a tool out records who has it and when it is due back. Clearing these fields returns it."
            >
              <div className="flex flex-col gap-5">
                <FormRow>
                  <Controller
                    name="borrowed_by"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="borrowed_by">
                          Borrowed By
                        </FieldLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
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
                  <Controller
                    name="borrowed_date"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="borrowed_date">
                          Borrowed Date
                        </FieldLabel>
                        <Input
                          {...field}
                          id="borrowed_date"
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

            <FormActions>
              <Button
                type="submit"
                form="edit-tool-form"
                disabled={updateTool.isPending}
              >
                {updateTool.isPending ? 'Updating...' : 'Update Tool'}
              </Button>
              <Button type="button" variant="outline" onClick={cancelEditing}>
                Cancel
              </Button>
            </FormActions>
          </FormLayout>
        </form>
      ) : (
        <div className="flex flex-col gap-5">
          <DetailSection title="Tool">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <EntityImage
                src={tool.image}
                alt={tool.name}
                className="border-border aspect-square w-full max-w-[220px] shrink-0 rounded-[20px] border"
              />
              {/* Status is not repeated here: the header already carries it as
                  a badge, and the same fact twice on one screen reads as two. */}
              <DetailGrid className="flex-1 lg:grid-cols-2">
                <DetailItem
                  label="Last Updated"
                  value={formatDateTime(tool.updated_at)}
                />
                <DetailItem label="Description" value={tool.description} wide />
              </DetailGrid>
            </div>
          </DetailSection>

          {isBorrowed && (
            <DetailSection
              title="Signed out"
              description="Who has this tool and when it is due back."
            >
              <DetailGrid>
                <DetailItem label="Borrowed By" value={borrowedByName} />
                <DetailItem
                  label="Borrowed Date"
                  value={formatDay(tool.borrowed_date)}
                />
                <DetailItem label="Due Back" value={dueBack} />
              </DetailGrid>
            </DetailSection>
          )}
        </div>
      )}

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
