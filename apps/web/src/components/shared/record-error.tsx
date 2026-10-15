import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api/client';
import EmptyState from './empty-state';

export function RecordError({
  error,
  backTo,
  onRetry
}: {
  error?: Error | null;
  backTo: string;
  onRetry: () => void;
}) {
  const message =
    !error || (error instanceof ApiError && error.status === 404)
      ? 'Record not found.'
      : `Unable to load this record. ${error.message}`;
  return (
    <div className="space-y-4">
      <EmptyState message={message} />
      <div className="flex justify-center gap-3">
        <Button variant="outline" onClick={onRetry}>
          Retry
        </Button>
        <Button variant="outline" asChild>
          <Link to={backTo}>Go back</Link>
        </Button>
      </div>
    </div>
  );
}
