import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  message: string;
  search?: string;
  onClearSearch?: () => void;
  hasFilters?: boolean;
  onClearFilters?: () => void;
}

// Shared so an empty list reads as a deliberate state rather than a broken page.
const EmptyState = ({
  message,
  search,
  onClearSearch,
  hasFilters,
  onClearFilters
}: EmptyStateProps) => (
  <div className="border-border text-muted-foreground rounded-[20px] border border-dashed p-12 text-center text-sm">
    {search && hasFilters
      ? 'No records match your search and filters.'
      : hasFilters
        ? 'No records match your filters.'
        : search
          ? 'No records match your search.'
          : message}
    {((search && onClearSearch) || (hasFilters && onClearFilters)) && (
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {search && onClearSearch && (
          <Button variant="outline" size="sm" onClick={onClearSearch}>
            Clear search
          </Button>
        )}
        {hasFilters && onClearFilters && (
          <Button variant="outline" size="sm" onClick={onClearFilters}>
            Clear filters
          </Button>
        )}
      </div>
    )}
  </div>
);

export default EmptyState;
