import { Badge } from '@/components/ui/badge';

export type StatusBadgeProps = {
  status: string;
};

const getBadgeVariant = (status: string) => {
  switch (status.toLowerCase()) {
    case 'available':
      return 'available';
    case 'on_trip':
    case 'in_use':
      return 'on_trip';
    case 'maintenance':
    case 'under_maintenance':
      return 'maintenance';
    case 'out_of_service':
    case 'not_available':
      return 'not_available';
    case 'to_be_repaired':
      return 'to_be_repaired';
    case 'borrowed':
      return 'borrowed';
    default:
      return 'default';
  }
};

const StatusBadge = ({ status }: StatusBadgeProps) => {
  const formattedStatus = status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase());
  const variant = getBadgeVariant(status);

  return (
    <Badge variant={variant} className="capitalize">
      {formattedStatus}
    </Badge>
  );
};

export default StatusBadge;
