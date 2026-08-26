import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import type {
  CreateOrgBody,
  OrgRecord,
  OrgResource,
  UpdateOrgBody
} from '@/lib/api/organization';
import {
  useBranchesAdmin,
  useOfficesAdmin,
  useOfficeHeadsAdmin
} from '@/lib/query/organization';
import {
  useCreateOrgRecord,
  useUpdateOrgRecord
} from '@/lib/mutation/organization';

// Radix Select forbids an empty-string item value, so "no parent" uses this
// sentinel in every picker here; it is normalised to null before submit.
const NONE = 'none';

const RESOURCE_LABELS: Record<OrgResource, string> = {
  branches: 'Branch',
  offices: 'Office',
  'office-heads': 'Office Head'
};

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  location: z.string().optional(),
  branchId: z.string().optional(),
  headId: z.string().optional(),
  officeId: z.string().optional()
});
type FormData = z.infer<typeof schema>;

type FieldKey = 'name' | 'location' | 'branchId' | 'headId' | 'officeId';
interface FieldConfig {
  key: FieldKey;
  label: string;
  kind: 'text' | 'select';
  /** Active (non-archived) options for a select field. */
  options?: OrgRecord[];
}

const idOrNull = (v: string | undefined): string | null =>
  v && v !== NONE ? v : null;

const textOrNull = (v: string | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

function defaultsFor(record: OrgRecord | null): FormData {
  return {
    name: record?.name ?? '',
    location: record?.location ?? '',
    branchId: record?.branchId ?? NONE,
    headId: record?.headId ?? NONE,
    officeId: record?.officeId ?? NONE
  };
}

function toBody(
  resource: OrgResource,
  data: FormData
): CreateOrgBody | UpdateOrgBody {
  switch (resource) {
    case 'branches':
      return { name: data.name.trim(), location: textOrNull(data.location) };
    case 'offices':
      return {
        name: data.name.trim(),
        branchId: idOrNull(data.branchId),
        headId: idOrNull(data.headId)
      };
    case 'office-heads':
      return {
        name: data.name.trim(),
        branchId: idOrNull(data.branchId),
        officeId: idOrNull(data.officeId)
      };
  }
}

export type RecordDialogState =
  | { mode: 'create' }
  | { mode: 'edit'; record: OrgRecord }
  | null;

interface RecordDialogProps {
  resource: OrgResource;
  state: RecordDialogState;
  onClose: () => void;
}

export function RecordDialog({ resource, state, onClose }: RecordDialogProps) {
  const create = useCreateOrgRecord(resource);
  const update = useUpdateOrgRecord(resource);
  // Every picker's source list, regardless of which resource this dialog is
  // currently editing — cheap and cached, and it keeps the branch/office/head
  // lookups available without conditionally calling hooks per resource.
  const { data: branches } = useBranchesAdmin();
  const { data: offices } = useOfficesAdmin();
  const { data: heads } = useOfficeHeadsAdmin();

  const isEdit = state?.mode === 'edit';
  const record = isEdit ? state.record : null;
  const open = state !== null;

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: defaultsFor(null)
  });

  // Hydrate from the record being edited (or blank, for create) each time the
  // dialog opens. Keyed on the id rather than the record object, so a
  // background refetch of the underlying list can't clobber an in-progress edit.
  useEffect(() => {
    if (open) form.reset(defaultsFor(record));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, record?.id]);

  const onSubmit = (data: FormData) => {
    const body = toBody(resource, data);
    if (isEdit && record) {
      update.mutate({ id: record.id, body }, { onSuccess: onClose });
    } else {
      create.mutate(body as CreateOrgBody, { onSuccess: onClose });
    }
  };

  const isSaving = create.isPending || update.isPending;

  // An office's headId and an office head's officeId point at each other, so
  // neither can be created fully-formed in one call. The head picker is left
  // out of the CREATE form entirely (not just empty) and only appears once the
  // office exists to edit.
  const activeBranches = (branches ?? []).filter((b) => b.archivedAt === null);
  const activeOffices = (offices ?? []).filter((o) => o.archivedAt === null);
  const activeHeads = (heads ?? []).filter((h) => h.archivedAt === null);

  const fields: FieldConfig[] = (() => {
    switch (resource) {
      case 'branches':
        return [
          { key: 'name', label: 'Name', kind: 'text' },
          { key: 'location', label: 'Location', kind: 'text' }
        ];
      case 'offices':
        return [
          { key: 'name', label: 'Name', kind: 'text' },
          {
            key: 'branchId',
            label: 'Branch',
            kind: 'select',
            options: activeBranches
          },
          ...(isEdit
            ? ([
                {
                  key: 'headId',
                  label: 'Office Head',
                  kind: 'select',
                  // Filtered for the same reason as branch/office: the API
                  // rejects an archived head with PARENT_ARCHIVED too, so an
                  // archived one has no business appearing as a choice here.
                  options: activeHeads
                }
              ] as FieldConfig[])
            : [])
        ];
      case 'office-heads':
        return [
          { key: 'name', label: 'Name', kind: 'text' },
          {
            key: 'branchId',
            label: 'Branch',
            kind: 'select',
            options: activeBranches
          },
          {
            key: 'officeId',
            label: 'Office',
            kind: 'select',
            options: activeOffices
          }
        ];
    }
  })();

  const resourceLabel = RESOURCE_LABELS[resource];

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? `Edit ${resourceLabel}` : `Add ${resourceLabel}`}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? `Update this ${resourceLabel.toLowerCase()}.`
              : `Create a new ${resourceLabel.toLowerCase()}.`}
          </DialogDescription>
        </DialogHeader>
        <form id="org-record-form" onSubmit={form.handleSubmit(onSubmit)}>
          <DialogBody>
            <div className="flex flex-col gap-5">
              {fields.map((f) => (
                <Controller
                  key={f.key}
                  name={f.key}
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={f.key}>
                        {f.label}
                        {f.key === 'name' ? ' *' : ''}
                      </FieldLabel>
                      {f.kind === 'text' ? (
                        <Input
                          {...field}
                          id={f.key}
                          aria-invalid={fieldState.invalid}
                          placeholder={f.label}
                        />
                      ) : (
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <SelectTrigger>
                            <SelectValue
                              placeholder={`Select ${f.label.toLowerCase()}`}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>None</SelectItem>
                            {f.options?.map((o) => (
                              <SelectItem key={o.id} value={o.id}>
                                {o.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              ))}
            </div>
          </DialogBody>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="org-record-form" disabled={isSaving}>
            {isSaving
              ? 'Saving...'
              : isEdit
                ? 'Save Changes'
                : `Add ${resourceLabel}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
