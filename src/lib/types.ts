// src/lib/types.ts

import type { Enums, Tables, TablesInsert, TablesUpdate } from "./types/supabase";

export type RouteStaticData = {
  title: string;
  icon: React.ComponentType;
  group: string;
};

export type Vehicle = Tables<'vehicles'>;
export type NewVehicle = TablesInsert<'vehicles'>;
export type UpdateVehicle = TablesUpdate<'vehicles'>;

export type Driver = Tables<'drivers'>;
export type NewDriver = TablesInsert<'drivers'>;
export type UpdateDriver = TablesUpdate<'drivers'>;

export type Admin = Tables<'admins'>;
export type NewAdmin = TablesInsert<'admins'>;
export type UpdateAdmin = TablesUpdate<'admins'>;

export type BorrowRequest = Tables<'borrow_requests'>;
export type NewBorrowRequest = TablesInsert<'borrow_requests'>;
export type UpdateBorrowRequest = TablesUpdate<'borrow_requests'>;

export type Branch = Tables<'branches'>;
export type NewBranch = TablesInsert<'branches'>;
export type UpdateBranch = TablesUpdate<'branches'>;

export type FuelAllocation = Tables<'fuel_allocations'>;
export type NewFuelAllocation = TablesInsert<'fuel_allocations'>;
export type UpdateFuelAllocation = TablesUpdate<'fuel_allocations'>;

export type JobOrder = Tables<'job_orders'>;
export type NewJobOrder = TablesInsert<'job_orders'>;
export type UpdateJobOrder = TablesUpdate<'job_orders'>;

export type Maintenance = Tables<'maintenance'>;
export type NewMaintenance = TablesInsert<'maintenance'>;
export type UpdateMaintenance = TablesUpdate<'maintenance'>;

export type MaintenanceCompletionLog = Tables<'maintenance_completion_logs'>;
export type NewMaintenanceCompletionLog = TablesInsert<'maintenance_completion_logs'>;
export type UpdateMaintenanceCompletionLog = TablesUpdate<'maintenance_completion_logs'>;

export type MaintenanceScheduleItem = Tables<'maintenance_schedule_items'>;
export type NewMaintenanceScheduleItem = TablesInsert<'maintenance_schedule_items'>;
export type UpdateMaintenanceScheduleItem = TablesUpdate<'maintenance_schedule_items'>;

export type MaintenanceStandard = Tables<'maintenance_standards'>;
export type NewMaintenanceStandard = TablesInsert<'maintenance_standards'>;
export type UpdateMaintenanceStandard = TablesUpdate<'maintenance_standards'>;

export type Tool = Tables<'tools'>;
export type NewTool = TablesInsert<'tools'>;
export type UpdateTool = TablesUpdate<'tools'>;

export type TripTicket = Tables<'trip_tickets'>;
export type NewTripTicket = TablesInsert<'trip_tickets'>;
export type UpdateTripTicket = TablesUpdate<'trip_tickets'>;

export type VehicleMaintenanceTracking = Tables<'vehicle_maintenance_tracking'>;
export type NewVehicleMaintenanceTracking = TablesInsert<'vehicle_maintenance_tracking'>;
export type UpdateVehicleMaintenanceTracking = TablesUpdate<'vehicle_maintenance_tracking'>;

export type UserRole = Tables<'user_roles'>;
export type NewUserRole = TablesInsert<'user_roles'>;
export type UpdateUserRole = TablesUpdate<'user_roles'>;

export type AppRole = Enums<'app_role'>; 