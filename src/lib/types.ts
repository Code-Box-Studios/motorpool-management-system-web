// src/lib/types.ts

import type { Enums, Tables, TablesInsert, TablesUpdate } from "./types/supabase";

export type RouteStaticData = {
  title: string;
  icon: React.ComponentType;
  group: string;
};

export type Vehicle = Tables<'vehicles'>;
export type VehicleWithBranch = Vehicle & {
  branch_name?: string;
};
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

export type TripTicketWithRelations = TripTicket & {
  branches: Branch | null;
  drivers: Driver | null;
  vehicles: Vehicle | null;
  fuel_allocations: FuelAllocation[];
};

export type VehicleMaintenanceTracking = Tables<'vehicle_maintenance_tracking'>;
export type NewVehicleMaintenanceTracking = TablesInsert<'vehicle_maintenance_tracking'>;
export type UpdateVehicleMaintenanceTracking = TablesUpdate<'vehicle_maintenance_tracking'>;

export type UserRole = Tables<'user_roles'>;
export type NewUserRole = TablesInsert<'user_roles'>;
export type UpdateUserRole = TablesUpdate<'user_roles'>;

export type UserProfile = Tables<'user_profiles'>;
export type NewUserProfile = TablesInsert<'user_profiles'>;
export type UpdateUserProfile = TablesUpdate<'user_profiles'>;

export type UserProfileData = UserProfile & {
  role?: string;
  branch_name?: string;
  roles_detailed?: Array<{
    id: string | null;
    name: string;
    source: string;
  }> | null;
};

export type Role = Tables<'roles'>;
export type NewRole = TablesInsert<'roles'>;
export type UpdateRole = TablesUpdate<'roles'>;

export type AppRole = Enums<'app_role'>;

/**
 * User metadata type for Supabase auth user_metadata
 */
export interface UserMetadata {
  full_name?: string;
  role?: string; // Role name (e.g., 'admin', 'driver')
  role_id?: string; // Role UUID
  branch_id?: string; // Branch UUID
  avatar_url?: string | null;
}

/**
 * Extended User type with properly typed user_metadata
 */
export interface ExtendedUser extends Omit<import('@supabase/supabase-js').User, 'user_metadata'> {
  user_metadata?: UserMetadata;
} 