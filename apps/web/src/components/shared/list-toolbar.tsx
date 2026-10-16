import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ListToolbarProps {
  viewControl?: ReactNode;
  searchControl?: ReactNode;
  filterControl?: ReactNode;
  className?: string;
}

export default function ListToolbar({
  viewControl,
  searchControl,
  filterControl,
  className
}: ListToolbarProps) {
  return (
    <div
      data-slot="list-toolbar"
      className={cn(
        'mb-4 flex min-w-0 flex-wrap items-center gap-3',
        className
      )}
    >
      {viewControl && <div className="max-w-full shrink-0">{viewControl}</div>}
      <div
        className={cn(
          'flex min-w-[min(100%,22rem)] flex-1 items-center gap-2',
          viewControl ? 'ml-auto justify-end' : 'justify-between'
        )}
      >
        {searchControl && (
          <div className="min-w-0 flex-1 sm:max-w-sm">{searchControl}</div>
        )}
        {filterControl && <div className="shrink-0">{filterControl}</div>}
      </div>
    </div>
  );
}
