import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  /** The page's single primary action, e.g. "Add Vehicle". */
  action?: ReactNode;
}

// One header for every page, so the eye lands in the same place on every
// navigation. Pages used to improvise this: some wrapped it in a Card, some
// used a bare heading, and the spacing differed on each.
const PageHeader = ({ title, description, action }: PageHeaderProps) => (
  <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description && (
        <p className="text-muted-foreground mt-1 text-sm">{description}</p>
      )}
    </div>
    {action}
  </header>
);

export default PageHeader;
