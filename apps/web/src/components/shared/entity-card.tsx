import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import StatusBadge from '@/components/shared/status-badge';

export interface EntityCardField {
  label: string;
  value: ReactNode;
}

interface EntityCardProps {
  to: string;
  title: string;
  status?: string;
  /** A real photo. When absent the card shows no image at all — a placeholder
   *  carries no information and would only push the data out of view. */
  imageSrc?: string | null;
  fields?: EntityCardField[];
  footnote?: ReactNode;
}

// A card for one record in a grid (vehicle, spare part, tool). The whole card
// is the link, so there is no redundant "View" button competing with it, and
// the record's identity leads instead of decoration.
const EntityCard = ({
  to,
  title,
  status,
  imageSrc,
  fields,
  footnote
}: EntityCardProps) => (
  <Link
    to={to}
    className="bg-card border-border hover:border-foreground/25 focus-visible:ring-ring group flex flex-col overflow-hidden rounded-[20px] border transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:shadow-lg focus-visible:ring-2 focus-visible:outline-none"
  >
    {imageSrc && (
      <img
        src={imageSrc}
        alt=""
        className="bg-muted aspect-video w-full object-cover"
      />
    )}

    <div className="flex flex-1 flex-col gap-3 p-5">
      {/* Badge above, not beside: in a narrow column a badge on the title's row
          squeezes it into three wrapped lines. */}
      <div className="flex flex-col items-start gap-2">
        {status && <StatusBadge status={status} />}
        <h3 className="leading-snug font-semibold tracking-tight">{title}</h3>
      </div>

      {fields && fields.length > 0 && (
        <dl className="mt-auto flex flex-col gap-1.5 text-sm">
          {fields.map((field) => (
            <div key={field.label} className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{field.label}</dt>
              <dd className="truncate font-medium">{field.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {footnote && (
        <p className="text-slate line-clamp-2 text-sm">{footnote}</p>
      )}
    </div>
  </Link>
);

export default EntityCard;
