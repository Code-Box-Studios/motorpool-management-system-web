import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { TableSkeleton } from '@/components/shared/skeleton/table-skeleton';
import { cn } from '@/lib/utils';
import type { OrgRecord, OrgResource } from '@/lib/api/organization';
import {
  useBranchesAdmin,
  useOfficesAdmin,
  useOfficeHeadsAdmin
} from '@/lib/query/organization';
import { useRestoreOrgRecord } from '@/lib/mutation/organization';
import { ArchiveDialog } from './archive-dialog';
import { RecordDialog, type RecordDialogState } from './record-dialog';

const isArchived = (r: OrgRecord) => r.archivedAt !== null;

type Column = 'Name' | 'Location' | 'Branch' | 'Office' | 'Office Head';

const RESOURCE_META: Record<
  OrgResource,
  { title: string; addLabel: string; columns: Column[] }
> = {
  branches: {
    title: 'Branches',
    addLabel: 'Add Branch',
    columns: ['Name', 'Location']
  },
  offices: {
    title: 'Offices',
    addLabel: 'Add Office',
    columns: ['Name', 'Branch', 'Office Head']
  },
  'office-heads': {
    title: 'Office Heads',
    addLabel: 'Add Office Head',
    columns: ['Name', 'Branch', 'Office']
  }
};

interface ResourceTabProps {
  resource: OrgResource;
}

// One table for all three tabs: which columns render and where each row's
// data comes from is driven by RESOURCE_META, not three near-duplicate
// components. All three admin lists are fetched unconditionally regardless of
// which resource this instance shows — Offices and Office Heads both need to
// resolve names from the other two lists, and react-query dedupes the
// requests a sibling tab already made.
export function ResourceTab({ resource }: ResourceTabProps) {
  const branchesQuery = useBranchesAdmin();
  const officesQuery = useOfficesAdmin();
  const headsQuery = useOfficeHeadsAdmin();
  const restore = useRestoreOrgRecord(resource);

  const [dialogState, setDialogState] = useState<RecordDialogState>(null);
  const [archivingRecord, setArchivingRecord] = useState<OrgRecord | null>(
    null
  );

  const query =
    resource === 'branches'
      ? branchesQuery
      : resource === 'offices'
        ? officesQuery
        : headsQuery;

  const records = query.data ?? [];
  const meta = RESOURCE_META[resource];

  const branchesById = new Map(
    (branchesQuery.data ?? []).map((b) => [b.id, b])
  );
  const officesById = new Map((officesQuery.data ?? []).map((o) => [o.id, o]));
  const headsById = new Map((headsQuery.data ?? []).map((h) => [h.id, h]));

  const renderCell = (record: OrgRecord, column: Column) => {
    switch (column) {
      case 'Name':
        return (
          <span className="inline-flex items-center gap-2">
            {record.name}
            {isArchived(record) && <Badge variant="stop">Archived</Badge>}
          </span>
        );
      case 'Location':
        return record.location || '—';
      case 'Branch':
        return record.branchId
          ? (branchesById.get(record.branchId)?.name ?? '—')
          : '—';
      case 'Office':
        return record.officeId
          ? (officesById.get(record.officeId)?.name ?? '—')
          : '—';
      case 'Office Head':
        return record.headId
          ? (headsById.get(record.headId)?.name ?? '—')
          : '—';
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-tight">{meta.title}</h2>
        <Button onClick={() => setDialogState({ mode: 'create' })}>
          <Plus className="size-4" />
          {meta.addLabel}
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          {query.isLoading ? (
            <TableSkeleton
              rows={5}
              columns={meta.columns.map((label) => ({ label }))}
            />
          ) : query.error ? (
            <div className="text-destructive p-8 text-center">
              Error loading {meta.title.toLowerCase()}: {query.error.message}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {meta.columns.map((c) => (
                    <TableHead key={c}>{c}</TableHead>
                  ))}
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.length > 0 ? (
                  records.map((record) => (
                    <TableRow
                      key={record.id}
                      className={cn(
                        isArchived(record) && 'text-muted-foreground'
                      )}
                    >
                      {meta.columns.map((c) => (
                        <TableCell key={c}>{renderCell(record, c)}</TableCell>
                      ))}
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setDialogState({ mode: 'edit', record })
                            }
                          >
                            Edit
                          </Button>
                          {isArchived(record) ? (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={restore.isPending}
                              onClick={() => restore.mutate(record.id)}
                            >
                              Restore
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setArchivingRecord(record)}
                            >
                              Archive
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={meta.columns.length + 1}
                      className="text-muted-foreground py-8 text-center"
                    >
                      No {meta.title.toLowerCase()} found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <RecordDialog
        resource={resource}
        state={dialogState}
        onClose={() => setDialogState(null)}
      />
      <ArchiveDialog
        resource={resource}
        record={archivingRecord}
        onClose={() => setArchivingRecord(null)}
      />
    </div>
  );
}
