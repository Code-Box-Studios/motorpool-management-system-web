interface EmptyStateProps {
  message: string;
}

// Shared so an empty list reads as a deliberate state rather than a broken page.
const EmptyState = ({ message }: EmptyStateProps) => (
  <div className="border-border text-muted-foreground rounded-[20px] border border-dashed p-12 text-center text-sm">
    {message}
  </div>
);

export default EmptyState;
