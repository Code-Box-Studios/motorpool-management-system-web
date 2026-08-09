import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { TableHead } from '@/components/ui/table';

export type SortState = { sortBy: string; sortOrder: 'asc' | 'desc' };

// Clickable column header: first click sorts ascending, clicking again flips
// to descending. Inactive columns show a faint both-ways glyph so sortable
// headers stay discoverable without shouting.
const SortableTableHead = ({
  label,
  sortKey,
  sort,
  onSort,
  className
}: {
  label: string;
  sortKey: string;
  sort: SortState | null;
  onSort: (next: SortState) => void;
  className?: string;
}) => {
  const active = sort?.sortBy === sortKey;
  return (
    <TableHead className={className}>
      <button
        type="button"
        className="hover:text-foreground -ml-1 inline-flex items-center gap-1 rounded px-1"
        onClick={() =>
          onSort({
            sortBy: sortKey,
            sortOrder: active && sort.sortOrder === 'asc' ? 'desc' : 'asc'
          })
        }
      >
        {label}
        {active ? (
          sort.sortOrder === 'asc' ? (
            <ArrowUp className="size-3.5" />
          ) : (
            <ArrowDown className="size-3.5" />
          )
        ) : (
          <ChevronsUpDown className="size-3.5 opacity-40" />
        )}
      </button>
    </TableHead>
  );
};

export default SortableTableHead;
