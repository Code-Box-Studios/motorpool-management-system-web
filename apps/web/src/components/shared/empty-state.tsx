import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  message: string;
  search?: string;
  onClearSearch?: () => void;
}

// Shared so an empty list reads as a deliberate state rather than a broken page.
const EmptyState = ({ message, search, onClearSearch }: EmptyStateProps) => (
  <div className="border-border text-muted-foreground rounded-[20px] border border-dashed p-12 text-center text-sm">
    {search ? 'No records match your search.' : message}
    {search && onClearSearch && (
      <div className="mt-3">
        <Button variant="outline" size="sm" onClick={onClearSearch}>
          Clear search
        </Button>
      </div>
    )}
  </div>
);

export default EmptyState;
