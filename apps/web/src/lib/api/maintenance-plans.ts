import { api } from './client';
import type {
  CreateScheduleItemBody,
  CreateStandardBody,
  UpdateStandardBody,
  CompleteTrackingBody
} from '@mms/shared';

export interface MaintenanceScheduleItem {
  id: string;
  maintenanceStandardId: string;
  taskName: string;
  taskDescription: string | null;
  intervalType: 'mileage' | 'time' | 'both';
  intervalMileage: number | null;
  intervalMonths: number | null;
}
export interface MaintenanceStandard {
  id: string;
  name: string;
  description: string | null;
  scheduleItems: MaintenanceScheduleItem[];
}
export interface MaintenanceTracking {
  id: string;
  vehicleId: string;
  maintenanceScheduleItemId: string;
  scheduleItem: MaintenanceScheduleItem;
  status: 'pending' | 'completed';
  displayStatus: 'pending' | 'completed' | 'due_soon' | 'overdue';
  nextDueDate: string | null;
  nextDueMileage: number | null;
  lastCompletedDate: string | null;
  lastCompletedMileage: number | null;
}
export const getMaintenanceStandards = async () =>
  (
    await api.get<{ data: MaintenanceStandard[]; count: number }>(
      '/maintenance-standards'
    )
  ).data;
export const saveMaintenanceStandard = ({
  id,
  body
}: {
  id?: string;
  body: CreateStandardBody | UpdateStandardBody;
}) =>
  id
    ? api.patch<MaintenanceStandard>(`/maintenance-standards/${id}`, body)
    : api.post<MaintenanceStandard>('/maintenance-standards', body);
export const deleteMaintenanceStandard = (id: string) =>
  api.del(`/maintenance-standards/${id}`);
export const addMaintenanceScheduleItem = ({
  standardId,
  body
}: {
  standardId: string;
  body: CreateScheduleItemBody;
}) =>
  api.post<MaintenanceScheduleItem>(
    `/maintenance-standards/${standardId}/schedule-items`,
    body
  );
export const removeMaintenanceScheduleItem = (id: string) =>
  api.del(`/maintenance-standards/schedule-items/${id}`);
export const getVehicleMaintenanceTracking = async (vehicleId: string) =>
  (
    await api.get<{ data: MaintenanceTracking[]; count: number }>(
      `/vehicles/${vehicleId}/maintenance-tracking`
    )
  ).data;
export const assignVehicleMaintenanceStandard = ({
  vehicleId,
  standardId
}: {
  vehicleId: string;
  standardId: string;
}) =>
  api.post(`/vehicles/${vehicleId}/maintenance-tracking`, {
    maintenanceStandardId: standardId
  });
export const completeMaintenanceTask = ({
  id,
  body
}: {
  id: string;
  body: CompleteTrackingBody;
}) => api.post(`/maintenance-tracking/${id}/complete`, body);
