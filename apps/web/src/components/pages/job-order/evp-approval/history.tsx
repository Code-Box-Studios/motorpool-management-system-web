import { Link } from '@tanstack/react-router';
import { Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/shared/empty-state';
import ListSearchInput from '@/components/shared/list-search-input';
import TablePagination from '@/components/shared/table-pagination';
import TableFilters from '@/components/shared/table-filters';
import { useListControls } from '@/hooks/use-list-controls';
import { useApprovalHistory } from '@/lib/query/approvals';
import { roleLabel } from '@/lib/role-label';

const LIMIT = 10;
const formatWhen = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString() : '—';

export default function ApprovalHistory() {
  const {
    page,
    setPage,
    search,
    setSearch,
    filters,
    setFilter,
    clearFilters,
    hasFilters
  } = useListControls(['approvalKind', 'approvalOutcome']);
  const { data, isLoading, error } = useApprovalHistory(
    page,
    LIMIT,
    true,
    search,
    { kind: filters.approvalKind, outcome: filters.approvalOutcome }
  );
  const records = data?.data ?? [];
  const count = data?.count ?? 0;

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ListSearchInput
            value={search}
            onChange={setSearch}
            label="Search approval history"
          />
          <p className="text-muted-foreground text-sm" aria-live="polite">
            {count} decision{count === 1 ? '' : 's'} · Newest first
          </p>
        </div>
        <TableFilters
          filters={[
            {
              key: 'approvalKind',
              label: 'Request type',
              options: [
                { value: 'fuel', label: 'Fuel · Trip ticket' },
                { value: 'repair', label: 'Repair · Job order' }
              ]
            },
            {
              key: 'approvalOutcome',
              label: 'Outcome',
              options: [
                { value: 'approved', label: 'Approved' },
                { value: 'declined', label: 'Declined' }
              ]
            }
          ]}
          values={filters}
          onChange={setFilter}
          onClear={clearFilters}
        />
        {isLoading ? (
          <Skeleton className="h-56 w-full rounded-[20px]" />
        ) : error ? (
          <p role="alert" className="text-destructive">
            Unable to load approval history. {error.message}
          </p>
        ) : records.length === 0 ? (
          <EmptyState
            message="No decisions recorded yet."
            hasFilters={hasFilters}
            onClearFilters={clearFilters}
            search={search}
            onClearSearch={() => setSearch('')}
          />
        ) : (
          <>
            <Table className="min-w-[1000px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Request</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Decided by</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>
                    <span className="sr-only">View</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((record) => (
                  <TableRow key={`${record.kind}-${record.id}`}>
                    <TableCell>
                      <div className="font-mono text-xs">{record.ref}</div>
                      <div className="text-muted-foreground mt-1 text-xs">
                        {record.kind === 'fuel'
                          ? 'Fuel · Trip ticket'
                          : 'Repair · Job order'}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-64 min-w-40 whitespace-normal">
                      <Link
                        to={record.linkTo}
                        className="font-medium hover:underline"
                      >
                        {record.title}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-56 text-sm whitespace-normal">
                      {record.subtitle ?? '—'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          record.outcome === 'approved' ? 'done' : 'stop'
                        }
                      >
                        {record.outcome === 'approved'
                          ? 'Approved'
                          : 'Declined'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {record.decidedByName ?? '—'}
                      </div>
                      {record.decidedByRole && (
                        <div className="text-muted-foreground mt-1 text-xs">
                          {roleLabel(record.decidedByRole)}
                          {record.decidedByRole !== 'evp_operations'
                            ? ' override'
                            : ''}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatWhen(record.decidedAt)}
                    </TableCell>
                    <TableCell className="max-w-64 min-w-32 text-sm whitespace-normal">
                      {record.liters !== null && (
                        <p>
                          {record.liters} L{' '}
                          <span className="text-muted-foreground capitalize">
                            {record.fuelType}
                          </span>
                        </p>
                      )}
                      {record.reason && (
                        <p className="text-muted-foreground mt-1">
                          {record.reason}
                        </p>
                      )}
                      {record.liters === null && !record.reason && '—'}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" asChild>
                        <Link to={record.linkTo}>
                          <Eye />
                          <span className="sr-only">View {record.ref}</span>
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TablePagination
              page={page}
              totalPages={Math.ceil(count / LIMIT)}
              onPageChange={setPage}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
