import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import StatusBadge from '@/components/shared/status-badge';
import { cn } from '@/lib/utils';

export interface EntityCardField {
  label: string;
  /** null/undefined/'' renders an em dash — a missing fact is still a fact. */
  value: ReactNode;
  /** Reference codes, plates, VINs and IMEIs are read character by character. */
  mono?: boolean;
}

interface EntityCardProps {
  to: string;
  title: string;
  status?: string;
  /** An extra pill beside the status, e.g. a stock warning on a part. */
  badge?: ReactNode;
  /** A real photo. When absent the card shows no image at all — a placeholder
   *  carries no information and would only push the data out of view. */
  imageSrc?: string | null;
  fields?: EntityCardField[];
  footnote?: ReactNode;
}

const isBlank = (value: ReactNode) =>
  value === null || value === undefined || value === '';

// A card for one record in a grid (vehicle, spare part, tool). The whole card
// is the link, so there is no redundant "View" button competing with it, and
// the record's identity leads instead of decoration.
const EntityCard = ({
  to,
  title,
  status,
  badge,
  imageSrc,
  fields,
  footnote
}: EntityCardProps) => (
  <Link
    to={to}
    className="bg-card border-border hover:border-foreground/25 focus-visible:ring-ring group flex h-full flex-col overflow-hidden rounded-[20px] border transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:shadow-lg focus-visible:ring-2 focus-visible:outline-none"
  >
    {imageSrc && (
      <img
        src={imageSrc}
        alt=""
        loading="lazy"
        className="bg-muted aspect-video w-full object-cover"
      />
    )}

    <div className="flex flex-1 flex-col gap-3 p-5">
      {/* Badge above, not beside: in a narrow column a badge on the title's row
          squeezes it into three wrapped lines. */}
      <div className="flex flex-col items-start gap-2">
        {(status || badge) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {status && <StatusBadge status={status} />}
            {badge}
          </div>
        )}
        <h3 className="leading-snug font-semibold tracking-tight">{title}</h3>
      </div>

      {footnote && <p className="text-slate line-clamp-2 text-sm">{footnote}</p>}

      {fields && fields.length > 0 && (
        // Pinned to the bottom of the card so that the facts line up across a
        // row whose titles and descriptions run to different lengths.
        <dl className="border-border mt-auto flex flex-col gap-1.5 border-t pt-3 text-sm">
          {fields.map((field) => (
            <div
              key={field.label}
              className="flex items-baseline justify-between gap-3"
            >
              <dt className="text-muted-foreground shrink-0">{field.label}</dt>
              <dd
                className={cn(
                  'truncate font-medium',
                  field.mono && 'font-mono',
                  isBlank(field.value) && 'text-muted-foreground'
                )}
              >
                {isBlank(field.value) ? '—' : field.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  </Link>
);

export default EntityCard;
