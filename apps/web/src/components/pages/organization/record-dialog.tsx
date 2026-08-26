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
import type {
  UpdateBranchBody,
  UpdateOfficeBody,
  UpdateOfficeHeadBody
} from '@mms/shared';
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
  /**
   * Active (non-archived) options for a select field, plus the record's
   * current value spliced back in if that parent has since been archived —
   * see `withCurrent`.
   */
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

// A record being edited may point at a parent that has since been archived —
// e.g. archive an office, then archive its (now childless) branch. The
// active-only list built for ambiguity #3 would then have no item matching
// the record's actual value, and Radix's Select renders that as a completely
// blank trigger (not even the placeholder) rather than showing what the
// record really points at. Splicing the current value back in — from the
// full, unfiltered list, deduped against what's already active — keeps it
// visible and selectable without reopening the door to picking some OTHER
// archived parent.
function withCurrent(
  active: OrgRecord[],
  currentId: string | null | undefined,
  all: OrgRecord[]
): OrgRecord[] {
  if (!currentId || currentId === NONE) return active;
  if (active.some((r) => r.id === currentId)) return active;
  const current = all.find((r) => r.id === currentId);
  return current ? [...active, current] : active;
}

// Create always sends the full shape the API expects — there is no
// "unchanged" to compare against yet. Edit sends only the keys that actually
// changed from `original`.
//
// tracker-devices' house style sends the whole object on every PATCH because
// that API diffs it server-side. This one does not:
// apps/api/src/lib/org-refs.ts documents that "only the keys actually
// present are checked — a PATCH that does not touch branchId does not
// re-validate it." Copying the tracker-devices habit here means renaming a
// record whose branchId/headId/officeId already (validly) points at
// something since archived re-validates that untouched reference on every
// save and hard-fails it with PARENT_ARCHIVED — the record becomes
// unrenamable. Sending only what changed restores the API's actual contract.
function toBody(
  resource: OrgResource,
  data: FormData,
  original: null
): CreateOrgBody;
function toBody(
  resource: OrgResource,
  data: FormData,
  original: FormData
): UpdateOrgBody;
function toBody(
  resource: OrgResource,
  data: FormData,
  original: FormData | null
): CreateOrgBody | UpdateOrgBody {
  const name = data.name.trim();
  const location = textOrNull(data.location);
  const branchId = idOrNull(data.branchId);
  const headId = idOrNull(data.headId);
  const officeId = idOrNull(data.officeId);

  if (!original) {
    switch (resource) {
      case 'branches':
        return { name, location };
      case 'offices':
        return { name, branchId, headId };
      case 'office-heads':
        return { name, branchId, officeId };
    }
  }

  const origName = original.name.trim();
  const origLocation = textOrNull(original.location);
  const origBranchId = idOrNull(original.branchId);
  const origHeadId = idOrNull(original.headId);
  const origOfficeId = idOrNull(original.officeId);

  switch (resource) {
    case 'branches': {
      const body: UpdateBranchBody = {};
      if (name !== origName) body.name = name;
      if (location !== origLocation) body.location = location;
      return body;
    }
    case 'offices': {
      const body: UpdateOfficeBody = {};
      if (name !== origName) body.name = name;
      if (branchId !== origBranchId) body.branchId = branchId;
      if (headId !== origHeadId) body.headId = headId;
      return body;
    }
    case 'office-heads': {
      const body: UpdateOfficeHeadBody = {};
      if (name !== origName) body.name = name;
      if (branchId !== origBranchId) body.branchId = branchId;
      if (officeId !== origOfficeId) body.officeId = officeId;
      return body;
    }
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
    if (isEdit && record) {
      // `record` is the object captured at the moment Edit was clicked and
      // stays stable for as long as the dialog is open (see the hydration
      // effect above), so re-deriving "original" from it here is exactly the
      // snapshot the form was reset to — not a live, possibly-refetched value.
      const body = toBody(resource, data, defaultsFor(record));
      update.mutate({ id: record.id, body }, { onSuccess: onClose });
    } else {
      const body = toBody(resource, data, null);
      create.mutate(body, { onSuccess: onClose });
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
            options: withCurrent(
              activeBranches,
              record?.branchId,
              branches ?? []
            )
          },
          ...(isEdit
            ? ([
                {
                  key: 'headId',
                  label: 'Office Head',
                  kind: 'select',
                  // Filtered for the same reason as branch/office: the API
                  // rejects an archived head with PARENT_ARCHIVED too, so an
                  // archived one has no business appearing as a fresh choice
                  // — withCurrent still lets the record's own (now-archived)
                  // head show up as what it's actually set to.
                  options: withCurrent(activeHeads, record?.headId, heads ?? [])
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
            options: withCurrent(
              activeBranches,
              record?.branchId,
              branches ?? []
            )
          },
          {
            key: 'officeId',
            label: 'Office',
            kind: 'select',
            options: withCurrent(activeOffices, record?.officeId, offices ?? [])
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
                          {/* id must match the FieldLabel's htmlFor above, or
                              the label is orphaned: clicking it does nothing
                              and a screen reader announces the combobox with
                              no name. The text Input branch already wires
                              id={f.key}; every select was missing it. */}
                          <SelectTrigger id={f.key}>
                            <SelectValue
                              placeholder={`Select ${f.label.toLowerCase()}`}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>None</SelectItem>
                            {f.options?.map((o) => (
                              <SelectItem key={o.id} value={o.id}>
                                {o.name}
                                {o.archivedAt !== null ? ' (archived)' : ''}
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
