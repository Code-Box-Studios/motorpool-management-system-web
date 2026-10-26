import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
  disabled: boolean;
}

export function CsvControls({
  resource,
  records,
  branches,
  offices,
  disabled
}: Props) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<OrganizationCsvPreview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const requestId = useRef(0);
  const headers = [...ORGANIZATION_CSV_HEADERS[resource]];
  const label = resource === 'employees' ? 'employees' : 'office heads';
  const changeOpen = (next: boolean) => {
    requestId.current++;
    setOpen(next);
    setCsv('');
    setPreview(null);
    setError('');
    setBusy(false);
  };
  const exportCsv = () => {
    const branchesById = new Map(branches.map((r) => [r.id, r.name]));
    const officesById = new Map(offices.map((r) => [r.id, r.name]));
    const rows = records.map((record) =>
      resource === 'employees'
        ? [
            record.id,
            record.name,
            record.position,
            record.phone,
            record.branchId,
            branchesById.get(record.branchId ?? ''),
            record.archivedAt
          ]
        : [
            record.id,
            record.name,
            record.branchId,
            branchesById.get(record.branchId ?? ''),
            record.officeId,
            officesById.get(record.officeId ?? ''),
            record.archivedAt
          ]
    );
    downloadCsv(`${resource}.csv`, encodeCsv(headers, rows));
  };
  const template = () => {
    const branch = branches.find((r) => !r.archivedAt);
    const office = offices.find(
      (r) => !r.archivedAt && (r.branchId ?? null) === (branch?.id ?? null)
    );
    const example =
      resource === 'employees'
        ? [
            '',
            'Example Person',
            'Clerk',
            '+639123456789',
            branch?.id,
            branch?.name ?? 'Main Branch',
            ''
          ]
        : [
            '',
            'Example Person',
            branch?.id,
            branch?.name ?? '',
            office?.id,
            office?.name,
            ''
          ];
    downloadCsv(`${resource}-template.csv`, encodeCsv(headers, [example]));
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['organization', resource] }),
        queryClient.invalidateQueries({
          queryKey: [resource === 'employees' ? 'employees' : 'officeHeads']
        })
      ]);
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
              Blank ID creates a person; existing ID updates that person.
              Duplicate names are allowed. Use active branch and office IDs or
              unambiguous names. Keep archived_at unchanged; use Archive or
              Restore to change status. Imports do not create login accounts.
            </p>
            <p className="text-muted-foreground text-sm">
              Template contains an Example Person row; replace it before import.
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
