import ListToolbar from '@/components/shared/list-toolbar';
import { matchesSearch } from '@mms/shared';
import ListSearchInput from '@/components/shared/list-search-input';
import TableFilters, {
  type TableFilterDefinition
} from '@/components/shared/table-filters';
import { useListControls } from '@/hooks/use-list-controls';
import EmptyState from '@/components/shared/empty-state';
import TablePagination from '@/components/shared/table-pagination';
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
  useOfficeHeadsAdmin,
  useEmployeesAdmin
} from '@/lib/query/organization';
import { useRestoreOrgRecord } from '@/lib/mutation/organization';
import { ArchiveDialog } from './archive-dialog';
import { CsvControls } from './csv-controls';
import { RecordDialog, type RecordDialogState } from './record-dialog';

const isArchived = (r: OrgRecord) => r.archivedAt !== null;

// Same page size as the app's other list tables.
const PAGE_SIZE = 10;

type Column =
  | 'Name'
  | 'Location'
  | 'Position'
  | 'Branch'
  | 'Office'
  | 'Office Head';

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
  },
  employees: {
    title: 'Employees',
    addLabel: 'Add Employee',
    columns: ['Name', 'Position', 'Branch']
  }
};

interface ResourceTabProps {
  resource: OrgResource;
}

// One table for all four tabs: which columns render and where each row's
// data comes from is driven by RESOURCE_META, not four near-duplicate
// components. All four admin lists are fetched unconditionally regardless of
// which resource this instance shows — Offices and Office Heads both need to
// resolve names from the other lists, hooks cannot be called conditionally
// anyway, and react-query dedupes the requests a sibling tab already made.
export function ResourceTab({ resource }: ResourceTabProps) {
  const branchesQuery = useBranchesAdmin();
  const officesQuery = useOfficesAdmin();
  const headsQuery = useOfficeHeadsAdmin();
  const employeesQuery = useEmployeesAdmin();
  const restore = useRestoreOrgRecord(resource);

  const [search, setSearch] = useState('');
  const statusKey = `${resource}Status`;
  const branchKey = `${resource}Branch`;
  const { page, setPage, filters, setFilter, clearFilters, hasFilters } =
    useListControls(
      resource === 'branches' ? [statusKey] : [statusKey, branchKey]
    );
  // Filters and tab switches reset the URL page through setFilter. Search is
  // local state, so a new search resets it here: staying on page 3 would hide
  // the first matches of a different result set.
  const changeSearch = (value: string) => {
    setSearch(value);
    if (page !== 1) setPage(1);
  };
  const [dialogState, setDialogState] = useState<RecordDialogState>(null);
  const [archivingRecord, setArchivingRecord] = useState<OrgRecord | null>(
    null
  );

  const query =
    resource === 'branches'
      ? branchesQuery
      : resource === 'offices'
        ? officesQuery
        : resource === 'office-heads'
          ? headsQuery
          : employeesQuery;

  const allRecords = query.data ?? [];
  const meta = RESOURCE_META[resource];

  const branchesById = new Map(
    (branchesQuery.data ?? []).map((b) => [b.id, b])
  );
  const officesById = new Map((officesQuery.data ?? []).map((o) => [o.id, o]));
  const headsById = new Map((headsQuery.data ?? []).map((h) => [h.id, h]));

  // Every list here is fetched archived-inclusive, because Restore needs the
  // row, but an archived record should leave the default view the moment it
  // is archived. Status therefore defaults to Active, and archived rows stay
  // reachable as Archived or All.
  const status = filters[statusKey] ?? 'active';
  const tableFilters: TableFilterDefinition[] = [
    {
      key: statusKey,
      label: 'Status',
      defaultValue: 'active',
      options: [
        { value: 'active', label: 'Active' },
        { value: 'archived', label: 'Archived' },
        { value: 'all', label: 'All' }
      ]
    }
  ];
  if (meta.columns.includes('Branch')) {
    tableFilters.push({
      key: branchKey,
      label: 'Branch',
      options: (branchesQuery.data ?? [])
        .map((branch) => ({ value: branch.id, label: branch.name }))
        .sort((a, b) => a.label.localeCompare(b.label))
    });
  }

  const records = allRecords.filter(
    (record) =>
      (status === 'all' ||
        (isArchived(record) ? 'archived' : 'active') === status) &&
      (!filters[branchKey] || record.branchId === filters[branchKey]) &&
      matchesSearch(search, [
        record.name,
        record.location,
        record.position,
        record.branchId ? branchesById.get(record.branchId)?.name : null,
        record.officeId ? officesById.get(record.officeId)?.name : null,
        record.headId ? headsById.get(record.headId)?.name : null,
        isArchived(record) ? 'Archived' : 'Active'
      ])
  );

  // Every list is fetched whole, so paging happens here. The page is clamped
  // because archiving the last row of the last page, or a stale ?page= link,
  // would otherwise land on an empty page past the end. CSV export still uses
  // the full filtered `records`, not just the visible page.
  const totalPages = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRecords = records.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

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
      case 'Position':
        return record.position || '—';
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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-tight">{meta.title}</h2>
        <Button onClick={() => setDialogState({ mode: 'create' })}>
          <Plus className="size-4" />
          {meta.addLabel}
        </Button>
      </div>

      <div className="mb-4">
        <CsvControls
          resource={resource}
          records={records}
          branches={branchesQuery.data ?? []}
          offices={officesQuery.data ?? []}
          heads={headsQuery.data ?? []}
          // Only the lists this resource's export and template read.
          disabled={[
            query,
            ...(resource === 'branches' ? [] : [branchesQuery]),
            ...(resource === 'office-heads' ? [officesQuery] : []),
            ...(resource === 'offices' ? [headsQuery] : [])
          ].some((q) => q.isLoading || !!q.error)}
        />
      </div>
      <Card>
        <CardContent>
          <ListToolbar
            searchControl={
              <ListSearchInput
                value={search}
                onChange={changeSearch}
                label={`Search ${meta.title.toLowerCase()}`}
              />
            }
            filterControl={
              <TableFilters
                filters={tableFilters}
                values={filters}
                onChange={setFilter}
                onClear={clearFilters}
              />
            }
          />
          {query.isLoading ? (
            // meta.columns + Actions: the real table below renders an extra
            // Actions header, so a skeleton built from meta.columns alone is
            // one column narrower and the whole table jumps sideways when the
            // data lands — the exact shift TableSkeleton exists to prevent.
            <TableSkeleton
              rows={5}
              columns={[
                ...meta.columns.map((label) => ({ label })),
                { label: 'Actions' }
              ]}
            />
          ) : query.error ? (
            <div className="text-destructive p-8 text-center">
              Error loading {meta.title.toLowerCase()}: {query.error.message}
            </div>
          ) : (
            <>
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
                  {pageRecords.length > 0 ? (
                    pageRecords.map((record) => (
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
                        <EmptyState
                          message={`No ${meta.title.toLowerCase()} found.`}
                          search={search}
                          hasFilters={hasFilters}
                          onClearFilters={clearFilters}
                          onClearSearch={() => changeSearch('')}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              <TablePagination
                page={currentPage}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </>
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
