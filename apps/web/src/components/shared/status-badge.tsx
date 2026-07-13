import { Badge } from '@/components/ui/badge';
import { resolveStatus } from '@/lib/status';

export type StatusBadgeProps = {
  status: string;
  className?: string;
};

// Presentation only — what a status means lives in @/lib/status, so the
// calendars can colour their chips from the same tones.
const StatusBadge = ({ status, className }: StatusBadgeProps) => {
  const { tone, label } = resolveStatus(status);
  return (
    <Badge variant={tone} className={className}>
      {label}
    </Badge>
  );
};

export default StatusBadge;
