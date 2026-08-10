import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import StatusBadge from '@/components/shared/status-badge';

// A record you can only read.
//
// Detail pages used to render a *form of disabled inputs* to show data nobody
// could edit: every value sat in a text box, wearing a border, a focus ring and
// sometimes a required-field asterisk, and a record ended up twice as tall as
// the facts it carried. A value that is absent showed an empty input with a
// placeholder ("Enter approver name") — which reads as a field waiting to be
// filled rather than a fact that does not exist yet.
//
// Data is data. It gets a definition list, an em dash when it is missing, and
// the mono face for the strings people read character by character.

interface RecordHeaderProps {
  /** The reference a person would say out loud — "TT-1", "MMS-0003". */
  reference?: string | null;
  title: string;
  /** Nullable: a record's status column is nullable in the database. */
  status?: string | null;
  /** The one-line identity under the title: "Toyota Hiace · MMS-0001". */
  meta?: ReactNode;
  /** Where "back" goes, e.g. the list this record came from. */
  backTo?: string;
  backLabel?: string;
  /** Transitions and edit affordances — the page's real actions. */
  actions?: ReactNode;
}

export const RecordHeader = ({
  reference,
  title,
  status,
  meta,
  backTo,
  backLabel,
  actions
}: RecordHeaderProps) => (
  <header className="mb-6">
    {backTo && (
      <Link
        to={backTo}
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm transition-colors"
      >
        <ChevronLeft className="size-4" />
        {backLabel ?? 'Back'}
      </Link>
    )}

    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="mb-1.5 flex flex-wrap items-center gap-3">
          {reference && (
            <span className="text-signal font-mono text-sm font-semibold">
              {reference}
            </span>
          )}
          {status && <StatusBadge status={status} />}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {meta && <p className="text-muted-foreground mt-1 text-sm">{meta}</p>}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  </header>
);

interface DetailSectionProps {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export const DetailSection = ({
  title,
  description,
  action,
  children,
  className
}: DetailSectionProps) => (
  <section
    className={cn('bg-card border-border rounded-[20px] border p-6', className)}
  >
    {(title || action) && (
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          {title && <h2 className="font-semibold tracking-tight">{title}</h2>}
          {description && (
            <p className="text-muted-foreground mt-0.5 text-sm">
              {description}
            </p>
          )}
        </div>
        {action}
      </header>
    )}
    {children}
  </section>
);

export const DetailGrid = ({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) => (
  <dl
    className={cn(
      'grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3',
      className
    )}
  >
    {children}
  </dl>
);

interface DetailItemProps {
  label: string;
  value?: ReactNode;
  /** Reference codes, plates, VINs — read character by character, so mono. */
  mono?: boolean;
  /** Prose (purpose, remarks, incident details) gets the full row. */
  wide?: boolean;
  className?: string;
}

// `false` and `0` are legitimate values; only null/undefined/'' are "missing".
const isMissing = (value: ReactNode): boolean =>
  value === null || value === undefined || value === '';

export const DetailItem = ({
  label,
  value,
  mono,
  wide,
  className
}: DetailItemProps) => {
  const missing = isMissing(value);
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-1',
        wide && 'sm:col-span-2 lg:col-span-3',
        className
      )}
    >
      <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {label}
      </dt>
      <dd
        className={cn(
          'text-sm leading-relaxed break-words',
          missing ? 'text-whisper' : 'font-medium',
          mono && !missing && 'font-mono'
        )}
      >
        {missing ? '—' : value}
      </dd>
    </div>
  );
};
