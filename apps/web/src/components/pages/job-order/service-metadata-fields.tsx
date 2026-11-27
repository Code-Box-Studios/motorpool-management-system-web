import { JOB_ORDER_MAINTENANCE_TYPES, maintenanceTypeLabel } from '@mms/shared';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

export function ServiceMetadataFields({
  maintenanceType,
  serviceLocation,
  onMaintenanceTypeChange,
  onServiceLocationChange,
  idPrefix = 'job-service'
}: {
  maintenanceType: string;
  serviceLocation: string;
  onMaintenanceTypeChange: (value: string) => void;
  onServiceLocationChange: (value: string) => void;
  idPrefix?: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-type`}>Maintenance type</Label>
        <Select
          value={maintenanceType || 'unspecified'}
          onValueChange={(value) =>
            onMaintenanceTypeChange(value === 'unspecified' ? '' : value)
          }
        >
          <SelectTrigger id={`${idPrefix}-type`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unspecified">Not recorded</SelectItem>
            {JOB_ORDER_MAINTENANCE_TYPES.map((value) => (
              <SelectItem key={value} value={value}>
                {maintenanceTypeLabel(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-location`}>Service location</Label>
        <Select
          value={serviceLocation || 'unspecified'}
          onValueChange={(value) =>
            onServiceLocationChange(value === 'unspecified' ? '' : value)
          }
        >
          <SelectTrigger id={`${idPrefix}-location`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unspecified">Not recorded</SelectItem>
            <SelectItem value="motorpool">Done in the motorpool</SelectItem>
            <SelectItem value="outside">Done outside</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
