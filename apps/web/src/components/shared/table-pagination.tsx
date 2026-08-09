import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Typography } from '@/components/ui/typography';

type TablePaginationProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

// Prev/next pager under every list table. Renders nothing while the whole
// list fits on one page, so short lists stay uncluttered.
const TablePagination = ({
  page,
  totalPages,
  onPageChange
}: TablePaginationProps) => {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-5 flex items-center justify-center">
      <Button
        variant="ghost"
        aria-label="Previous page"
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page === 1}
      >
        <ChevronLeft />
      </Button>
      <Typography variant="p-xs">
        {page} of {totalPages}
      </Typography>
      <Button
        variant="ghost"
        aria-label="Next page"
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
      >
        <ChevronRight />
      </Button>
    </div>
  );
};

export default TablePagination;
