import { useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  encodeCsv,
  ORGANIZATION_CSV_HEADERS,
  ORGANIZATION_CSV_MAX_BYTES,
  type OrganizationCsvPreview,
  type OrganizationCsvResource
} from '@mms/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  importOrgCsv,
  previewOrgCsv,
  type OrgRecord
} from '@/lib/api/organization';
import { ApiError } from '@/lib/api/client';
import { useOrgInvalidation } from '@/lib/mutation/organization';

const LABELS: Record<OrganizationCsvResource, string> = {
  employees: 'employees',
  'office-heads': 'office heads',
  branches: 'branches',
  offices: 'offices'
};

// What a row does on import, per resource. People may share a name; branch
// names are unique, and office names are unique within their branch.
const IMPORT_RULES: Record<OrganizationCsvResource, string> = {
  employees:
    'Blank ID creates a person; existing ID updates that person. Duplicate names are allowed. Use active branch IDs or unambiguous names. Imports do not create login accounts.',
  'office-heads':
    'Blank ID creates a person; existing ID updates that person. Duplicate names are allowed. Use active branch and office IDs or unambiguous names. Imports do not create login accounts.',
  branches:
    'Blank ID creates a branch; existing ID updates that branch. Branch names must be unique.',
  offices:
    'Blank ID creates an office; existing ID updates that office. Office names must be unique within a branch. Use active branch and office head IDs or unambiguous names.'
};

function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(
    new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' })
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface Props {
  resource: OrganizationCsvResource;
  records: OrgRecord[];
  branches: OrgRecord[];
  offices: OrgRecord[];
  heads: OrgRecord[];
  disabled: boolean;
}

export function CsvControls({
  resource,
  records,
  branches,
  offices,
  heads,
  disabled
}: Props) {
  const invalidate = useOrgInvalidation(resource);
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<OrganizationCsvPreview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const requestId = useRef(0);
  const headers = [...ORGANIZATION_CSV_HEADERS[resource]];
  const label = LABELS[resource];
  const changeOpen = (next: boolean) => {
    requestId.current++;
    setOpen(next);
    setCsv('');
    setPreview(null);
    setError('');
    setBusy(false);
  };
  // Column order follows ORGANIZATION_CSV_HEADERS[resource].
  const exportCsv = () => {
    const nameOf = (list: OrgRecord[], id?: string | null) =>
      list.find((r) => r.id === id)?.name;
    const rows = records.map((record) => {
      switch (resource) {
        case 'employees':
          return [
            record.id,
            record.name,
            record.position,
            record.phone,
            record.branchId,
            nameOf(branches, record.branchId),
            record.archivedAt
          ];
        case 'office-heads':
          return [
            record.id,
            record.name,
            record.branchId,
            nameOf(branches, record.branchId),
            record.officeId,
            nameOf(offices, record.officeId),
            record.archivedAt
          ];
        case 'branches':
          return [record.id, record.name, record.location, record.archivedAt];
        case 'offices':
          return [
            record.id,
            record.name,
            record.branchId,
            nameOf(branches, record.branchId),
            record.headId,
            nameOf(heads, record.headId),
            record.archivedAt
          ];
      }
    });
    downloadCsv(`${resource}.csv`, encodeCsv(headers, rows));
  };
  const template = () => {
    const branch = branches.find((r) => !r.archivedAt);
    const office = offices.find(
      (r) => !r.archivedAt && (r.branchId ?? null) === (branch?.id ?? null)
    );
    const examples: Record<OrganizationCsvResource, (string | undefined)[]> = {
      employees: [
        '',
        'Example Person',
        'Clerk',
        '+639123456789',
        branch?.id,
        branch?.name ?? 'Main Branch',
        ''
      ],
      'office-heads': [
        '',
        'Example Person',
        branch?.id,
        branch?.name ?? '',
        office?.id,
        office?.name,
        ''
      ],
      branches: ['', 'Example Branch', 'Example City', ''],
      offices: [
        '',
        'Example Office',
        branch?.id,
        branch?.name ?? '',
        '',
        '',
        ''
      ]
    };
    downloadCsv(
      `${resource}-template.csv`,
      encodeCsv(headers, [examples[resource]])
    );
  };
  const loadFile = async (file?: File) => {
    const current = ++requestId.current;
    setCsv('');
    setPreview(null);
    setError('');
    if (!file) return;
    if (file.size > ORGANIZATION_CSV_MAX_BYTES) {
      setError('File exceeds 512 KiB limit.');
      return;
    }
    setBusy(true);
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(
        await file.arrayBuffer()
      );
      if (current === requestId.current) setCsv(text);
    } catch {
      if (current === requestId.current)
        setError('Choose a valid UTF-8 CSV file.');
    } finally {
      if (current === requestId.current) setBusy(false);
    }
  };
  const review = async () => {
    const current = ++requestId.current;
    setBusy(true);
    setError('');
    setPreview(null);
    try {
      const result = await previewOrgCsv(resource, csv);
      if (current === requestId.current) setPreview(result);
    } catch (err) {
      if (current === requestId.current) setError((err as Error).message);
    } finally {
      if (current === requestId.current) setBusy(false);
    }
  };
  const confirm = async () => {
    if (!preview || preview.errors.length || busy) return;
    const current = ++requestId.current;
    setBusy(true);
    setError('');
    try {
      const result = await importOrgCsv(resource, csv, preview.previewToken);
      // The same caches a manual edit refreshes, so a branch renamed by CSV
      // also updates the vehicle and user tables that show branch names.
      await invalidate();
      toast.success(
        `Imported ${result.created} new and ${result.updated} updated ${label}`
      );
      if (current === requestId.current) changeOpen(false);
    } catch (err) {
      if (current !== requestId.current) return;
      if (err instanceof ApiError && err.code === 'CSV_VALIDATION_ERROR')
        setPreview(err.details as OrganizationCsvPreview);
      else setPreview(null);
      setError((err as Error).message);
    } finally {
      if (current === requestId.current) setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogTrigger asChild>
          <Button variant="outline">Import CSV</Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import {label} CSV</DialogTitle>
            <DialogDescription>
              Review every row before importing. Maximum 512 KiB and 1,000 data
              rows.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <p className="text-muted-foreground text-sm">
              {IMPORT_RULES[resource]} Keep archived_at unchanged; use Archive
              or Restore to change status.
            </p>
            <p className="text-muted-foreground text-sm">
              Template contains an example row; replace it before import.
              Exports prefix formula-like text with an apostrophe and double
              literal leading apostrophes. Import reverses these escapes,
              including +63 phone numbers.
            </p>
            <div className="space-y-2">
              <Label htmlFor={`${resource}-csv-file`}>CSV file</Label>
              <Input
                id={`${resource}-csv-file`}
                type="file"
                accept=".csv,text/csv"
                disabled={busy}
                onChange={(event) => void loadFile(event.target.files?.[0])}
              />
            </div>
            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
            {preview && (
              <div className="space-y-3" aria-live="polite">
                <p>
                  {preview.created} create · {preview.updated} update ·{' '}
                  {preview.errors.length} errors
                </p>
                {preview.errors.length > 0 && (
                  <ul className="text-destructive list-inside list-disc text-sm">
                    {preview.errors.map((item, index) => (
                      <li key={index}>
                        Row {item.row}: {item.message}
                      </li>
                    ))}
                  </ul>
                )}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Row</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Name</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.records.map((record) => (
                      <TableRow key={record.row}>
                        <TableCell>{record.row}</TableCell>
                        <TableCell>{record.action}</TableCell>
                        <TableCell>{record.name}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => changeOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="outline"
              disabled={!csv || busy}
              onClick={() => void review()}
            >
              {busy ? 'Working...' : 'Preview CSV'}
            </Button>
            <Button
              disabled={
                !preview ||
                preview.errors.length > 0 ||
                busy ||
                preview.total === 0
              }
              onClick={() => void confirm()}
            >
              Confirm import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Button variant="outline" disabled={disabled} onClick={exportCsv}>
        Export CSV
      </Button>
      <Button variant="outline" disabled={disabled} onClick={template}>
        Download template
      </Button>
    </div>
  );
}
