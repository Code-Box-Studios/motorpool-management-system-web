import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

interface TableSkeletonProps {
  rows?: number;
  columns?: { label: string; width?: string }[];
}

export function TableSkeleton({
  rows = 5,
  columns = [
    { label: 'ID', width: 'w-20' },
    { label: 'Full Name', width: 'w-32' },
    { label: 'Avatar URL', width: 'w-40' }
  ]
}: TableSkeletonProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((column, index) => (
            <TableHead key={index}>{column.label}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <TableRow key={rowIndex}>
            {columns.map((column, colIndex) => (
              <TableCell key={colIndex}>
                <Skeleton className={`h-4 ${column.width || 'w-32'}`} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
