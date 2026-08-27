import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Eye } from 'lucide-react';
import type { DecisionRecord } from '@mms/shared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/shared/empty-state';
import TablePagination from '@/components/shared/table-pagination';
import { useApprovalHistory } from '@/lib/query/approvals';
import { roleLabel } from '@/lib/role-label';

const LIMIT = 10;

const formatWhen = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString() : '—';

export default function ApprovalHistory() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useApprovalHistory(page, LIMIT);

  const records = data?.data ?? [];
  const totalPages = Math.ceil((data?.count ?? 0) / LIMIT);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-[20px]" />
        <Skeleton className="h-24 w-full rounded-[20px]" />
      </div>
    );
  }

  if (records.length === 0) {
    return <EmptyState message="No decisions recorded yet." />;
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        {records.map((record: DecisionRecord) => (
          <article
            key={`${record.kind}-${record.id}`}
            className="bg-card border-border flex flex-wrap items-center gap-5 rounded-[20px] border p-6"
          >
            <div className="min-w-[230px] flex-1">
              <div className="text-muted-foreground font-mono text-xs">
                {record.ref}
              </div>
              <h3 className="mt-1 text-lg font-semibold tracking-tight">
                {record.title}
              </h3>
              <p className="text-slate mt-1.5 text-sm leading-relaxed">
                {record.subtitle}
                <br />
                {record.outcome === 'approved' ? 'Approved' : 'Declined'} by{' '}
                <strong className="text-foreground font-semibold">
                  {record.decidedByName ?? '—'}
                </strong>
                {/* An EVP must be able to tell a sign-off they never made from
                    one they did — /approve-evp admits an admin as an override. */}
                {record.decidedByRole && record.decidedByRole !== 'evp_operations' && (
                  <> ({roleLabel(record.decidedByRole)} override)</>
                )}{' '}
                · {formatWhen(record.decidedAt)}
              </p>
              {record.reason && (
                <p className="text-slate mt-2 text-sm italic">
                  “{record.reason}”
                </p>
              )}
            </div>

            {record.liters !== null && (
              <div className="flex-none text-right">
                <div className="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">
                  Fuel budget
                </div>
                <div className="text-2xl font-medium tracking-tight">
                  {record.liters} L
                </div>
                {record.fuelType && (
                  <div className="text-slate mt-0.5 text-xs capitalize">
                    {record.fuelType}
                  </div>
                )}
              </div>
            )}

            <Button variant="ghost" size="icon" asChild>
              <Link to={record.linkTo}>
                <Eye />
                <span className="sr-only">View {record.ref}</span>
              </Link>
            </Button>
          </article>
        ))}
      </div>

      <TablePagination
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
      />
    </>
  );
}
