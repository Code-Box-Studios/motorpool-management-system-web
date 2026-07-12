// src/components/pages/tracker-devices/action.ts
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { TRACKER_DEVICE_STATUS } from '@mms/shared';
import type {
  CreateTrackerDeviceBody,
  UpdateTrackerDeviceBody
} from '@mms/shared';
import type { TrackerDevice } from '@/lib/api/tracker-devices';

// Radix Select forbids empty-string item values, so an unassigned device uses
// this sentinel in the vehicle picker; it is normalised to null before submit.
export const UNASSIGNED_VEHICLE = 'unassigned';

export const trackerDeviceSchema = z.object({
  // Trim first: a whitespace-only IMEI must fail here (inline field error), not
  // trim to "" downstream and come back as a confusing server 400.
  imei: z.string().trim().min(1, 'IMEI is required'),
  label: z.string().optional(),
  simNumber: z.string().optional(),
  status: z.nativeEnum(TRACKER_DEVICE_STATUS),
  vehicleId: z.string().optional(),
  notes: z.string().optional()
});

export type TrackerDeviceFormData = z.infer<typeof trackerDeviceSchema>;

export const useTrackerDeviceForm = () => {
  return useForm<TrackerDeviceFormData>({
    resolver: zodResolver(trackerDeviceSchema),
    defaultValues: {
      imei: '',
      label: '',
      simNumber: '',
      status: TRACKER_DEVICE_STATUS.ACTIVE,
      vehicleId: UNASSIGNED_VEHICLE,
      notes: ''
    }
  });
};

// Trimmed non-empty string, else null (the API models optional text as nullable).
const orNull = (v: string | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

// Vehicle Select value -> uuid or null (sentinel/empty -> unassigned).
const vehicleOrNull = (v: string | undefined): string | null =>
  v && v !== UNASSIGNED_VEHICLE ? v : null;

// Form -> API create body.
export function toCreateBody(
  data: TrackerDeviceFormData
): CreateTrackerDeviceBody {
  return {
    imei: data.imei.trim(),
    label: orNull(data.label),
    simNumber: orNull(data.simNumber),
    status: data.status,
    vehicleId: vehicleOrNull(data.vehicleId),
    notes: orNull(data.notes)
  };
}

// Form -> API update body (PATCH accepts the same full object; server diffs it).
export function toUpdateBody(
  data: TrackerDeviceFormData
): UpdateTrackerDeviceBody {
  return toCreateBody(data);
}

// API row -> form values (hydrate the edit form via form.reset).
export function toFormValues(device: TrackerDevice): TrackerDeviceFormData {
  return {
    imei: device.imei,
    label: device.label ?? '',
    simNumber: device.simNumber ?? '',
    status: device.status,
    vehicleId: device.vehicleId ?? UNASSIGNED_VEHICLE,
    notes: device.notes ?? ''
  };
}
