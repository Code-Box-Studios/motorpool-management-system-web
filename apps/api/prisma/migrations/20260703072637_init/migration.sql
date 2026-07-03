-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('available', 'unavailable', 'on_trip', 'out_of_service', 'under_maintenance');

-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('gasoline', 'diesel', 'electric', 'hybrid', 'other');

-- CreateEnum
CREATE TYPE "DriverStatus" AS ENUM ('active', 'inactive', 'on_trip');

-- CreateEnum
CREATE TYPE "ToolStatus" AS ENUM ('available', 'borrowed', 'under_maintenance', 'out_of_service');

-- CreateEnum
CREATE TYPE "TripTicketStatus" AS ENUM ('pending_admin_approval', 'pending_fuel_allocation_approval', 'approved', 'in_progress', 'completed', 'cancelled', 'disapproved');

-- CreateEnum
CREATE TYPE "JobOrderStatus" AS ENUM ('pending', 'assigned_mechanic', 'ongoing_repair', 'repaired');

-- CreateEnum
CREATE TYPE "RepairType" AS ENUM ('simple', 'complex', 'compound');

-- CreateEnum
CREATE TYPE "MaintenanceType" AS ENUM ('preventive', 'corrective', 'inspection', 'repair', 'service');

-- CreateEnum
CREATE TYPE "AllocationStatus" AS ENUM ('pending', 'approved', 'disapproved', 'cancelled');

-- CreateEnum
CREATE TYPE "BorrowRequestStatus" AS ENUM ('pending', 'approved', 'returned');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "date_of_birth" DATE,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "branch_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "department_offices" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "branch_id" UUID,
    "head_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "department_offices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "office_heads" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "branch_id" UUID,
    "office_id" UUID,

    CONSTRAINT "office_heads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "vin" TEXT NOT NULL,
    "license_plate" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "fuel_type" "FuelType" NOT NULL,
    "mileage" INTEGER NOT NULL,
    "status" "VehicleStatus" NOT NULL DEFAULT 'available',
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "insurance_expiry" DATE NOT NULL,
    "registration_expiry" DATE NOT NULL,
    "branch_id" UUID,
    "maintenance_standard_id" UUID,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "last_location_update" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "email" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "date_of_birth" DATE,
    "license_number" TEXT,
    "license_type" TEXT,
    "license_expiry" DATE,
    "status" "DriverStatus" NOT NULL DEFAULT 'active',
    "assigned_vehicle_id" UUID,
    "branch_id" UUID,
    "sss_number" TEXT,
    "tin" TEXT,
    "hire_date" DATE,
    "emergency_contact_name" TEXT,
    "emergency_contact_phone" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_tickets" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "office_id" UUID,
    "office_head_id" UUID,
    "destination" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "date_requested" DATE NOT NULL,
    "participants" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "participants_count" INTEGER,
    "prepared_by" TEXT NOT NULL,
    "requested_by" UUID,
    "remarks" TEXT,
    "qr_id" TEXT,
    "status" "TripTicketStatus" NOT NULL DEFAULT 'pending_admin_approval',
    "approved_by_admin" UUID,
    "disapproved_reason" TEXT,
    "cancellation_reason" TEXT,
    "pre_trip_guard" UUID,
    "pre_trip_checked_by" UUID,
    "pre_trip_checked_at" TIMESTAMP(3),
    "post_trip_guard" UUID,
    "post_trip_checked_by" UUID,
    "post_trip_checked_at" TIMESTAMP(3),
    "start_ts" TIMESTAMP(3),
    "end_ts" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fuel_allocations" (
    "id" UUID NOT NULL,
    "trip_ticket_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "branch_id" UUID,
    "requested_by" UUID NOT NULL,
    "approved_by_evp" UUID,
    "liters" DOUBLE PRECISION NOT NULL,
    "fuel_type" "FuelType" NOT NULL,
    "date" DATE NOT NULL,
    "purpose" TEXT NOT NULL,
    "trip_to" TEXT NOT NULL,
    "status" "AllocationStatus" NOT NULL DEFAULT 'pending',
    "disapproved_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fuel_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_orders" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "status" "JobOrderStatus" NOT NULL DEFAULT 'pending',
    "incident_date" DATE,
    "incident_details" TEXT,
    "requested_by" UUID,
    "noted_by" UUID,
    "approved_by" UUID,
    "assigned_mechanic" UUID,
    "date_of_request" DATE,
    "date_approved" DATE,
    "target_date" DATE,
    "actual_date_of_release" DATE,
    "repair_done" "RepairType",
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_order_spare_parts" (
    "job_order_id" UUID NOT NULL,
    "spare_part_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "job_order_spare_parts_pkey" PRIMARY KEY ("job_order_id","spare_part_id")
);

-- CreateTable
CREATE TABLE "maintenance" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "type" "MaintenanceType" NOT NULL,
    "date" DATE NOT NULL,
    "cost" DOUBLE PRECISION,
    "mileage" INTEGER,
    "next_due" DATE,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_standards" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_standards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_schedule_items" (
    "id" UUID NOT NULL,
    "maintenance_standard_id" UUID NOT NULL,
    "task_name" TEXT NOT NULL,
    "task_description" TEXT,
    "interval_type" TEXT NOT NULL,
    "interval_mileage" INTEGER,
    "interval_months" INTEGER,

    CONSTRAINT "maintenance_schedule_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_maintenance_tracking" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "maintenance_schedule_item_id" UUID NOT NULL,
    "last_completed_date" DATE,
    "last_completed_mileage" INTEGER,
    "next_due_date" DATE,
    "next_due_mileage" INTEGER,
    "status" TEXT,

    CONSTRAINT "vehicle_maintenance_tracking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_completion_logs" (
    "id" UUID NOT NULL,
    "vehicle_maintenance_tracking_id" UUID NOT NULL,
    "completed_by" UUID NOT NULL,
    "completed_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedMileage" INTEGER NOT NULL,
    "notes" TEXT,

    CONSTRAINT "maintenance_completion_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spare_parts" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "image" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spare_parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tools" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ToolStatus" NOT NULL DEFAULT 'available',
    "image" TEXT,
    "borrowed_by" UUID,
    "borrowed_date" DATE,
    "estimated_return_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "borrow_requests" (
    "id" UUID NOT NULL,
    "tool_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "approved_by" UUID,
    "status" "BorrowRequestStatus" NOT NULL DEFAULT 'pending',
    "request_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_at" TIMESTAMP(3),
    "estimated_return_date" DATE NOT NULL,

    CONSTRAINT "borrow_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gps_data" (
    "gps_id" UUID NOT NULL,
    "vehicle_id" UUID,
    "trip_id" UUID,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "engine_status" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gps_data_pkey" PRIMARY KEY ("gps_id")
);

-- CreateTable
CREATE TABLE "geofence_area" (
    "geofence_id" UUID NOT NULL,
    "geofence_name" TEXT,
    "latitude_center" DOUBLE PRECISION,
    "longitude_center" DOUBLE PRECISION,
    "radius_meters" DOUBLE PRECISION,

    CONSTRAINT "geofence_area_pkey" PRIMARY KEY ("geofence_id")
);

-- CreateTable
CREATE TABLE "geofence_violation" (
    "violation_id" UUID NOT NULL,
    "geofence_id" UUID,
    "trip_id" UUID,
    "event_type" TEXT,
    "gfv_latitude" DOUBLE PRECISION,
    "gfv_longitude" DOUBLE PRECISION,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "geofence_violation_pkey" PRIMARY KEY ("violation_id")
);

-- CreateTable
CREATE TABLE "vehicle_status_audit" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "old_status" TEXT,
    "new_status" TEXT,
    "changed_by" UUID,
    "change_source" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_status_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_key" ON "user_roles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_user_id_key" ON "drivers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_email_key" ON "drivers"("email");

-- CreateIndex
CREATE INDEX "trip_tickets_status_idx" ON "trip_tickets"("status");

-- CreateIndex
CREATE INDEX "trip_tickets_branch_id_idx" ON "trip_tickets"("branch_id");

-- CreateIndex
CREATE INDEX "trip_tickets_driver_id_idx" ON "trip_tickets"("driver_id");

-- CreateIndex
CREATE UNIQUE INDEX "fuel_allocations_trip_ticket_id_key" ON "fuel_allocations"("trip_ticket_id");

-- CreateIndex
CREATE INDEX "job_orders_status_idx" ON "job_orders"("status");

-- CreateIndex
CREATE INDEX "gps_data_vehicle_id_created_at_idx" ON "gps_data"("vehicle_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_offices" ADD CONSTRAINT "department_offices_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_offices" ADD CONSTRAINT "department_offices_head_id_fkey" FOREIGN KEY ("head_id") REFERENCES "office_heads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_heads" ADD CONSTRAINT "office_heads_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_heads" ADD CONSTRAINT "office_heads_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "department_offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_maintenance_standard_id_fkey" FOREIGN KEY ("maintenance_standard_id") REFERENCES "maintenance_standards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_assigned_vehicle_id_fkey" FOREIGN KEY ("assigned_vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_tickets" ADD CONSTRAINT "trip_tickets_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_tickets" ADD CONSTRAINT "trip_tickets_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_tickets" ADD CONSTRAINT "trip_tickets_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_tickets" ADD CONSTRAINT "trip_tickets_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "department_offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_tickets" ADD CONSTRAINT "trip_tickets_office_head_id_fkey" FOREIGN KEY ("office_head_id") REFERENCES "office_heads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_tickets" ADD CONSTRAINT "trip_tickets_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_tickets" ADD CONSTRAINT "trip_tickets_approved_by_admin_fkey" FOREIGN KEY ("approved_by_admin") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_tickets" ADD CONSTRAINT "trip_tickets_pre_trip_guard_fkey" FOREIGN KEY ("pre_trip_guard") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_tickets" ADD CONSTRAINT "trip_tickets_post_trip_guard_fkey" FOREIGN KEY ("post_trip_guard") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_tickets" ADD CONSTRAINT "trip_tickets_pre_trip_checked_by_fkey" FOREIGN KEY ("pre_trip_checked_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_tickets" ADD CONSTRAINT "trip_tickets_post_trip_checked_by_fkey" FOREIGN KEY ("post_trip_checked_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_allocations" ADD CONSTRAINT "fuel_allocations_trip_ticket_id_fkey" FOREIGN KEY ("trip_ticket_id") REFERENCES "trip_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_allocations" ADD CONSTRAINT "fuel_allocations_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_allocations" ADD CONSTRAINT "fuel_allocations_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_allocations" ADD CONSTRAINT "fuel_allocations_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_allocations" ADD CONSTRAINT "fuel_allocations_approved_by_evp_fkey" FOREIGN KEY ("approved_by_evp") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_orders" ADD CONSTRAINT "job_orders_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_orders" ADD CONSTRAINT "job_orders_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_orders" ADD CONSTRAINT "job_orders_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_orders" ADD CONSTRAINT "job_orders_noted_by_fkey" FOREIGN KEY ("noted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_orders" ADD CONSTRAINT "job_orders_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_orders" ADD CONSTRAINT "job_orders_assigned_mechanic_fkey" FOREIGN KEY ("assigned_mechanic") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_order_spare_parts" ADD CONSTRAINT "job_order_spare_parts_job_order_id_fkey" FOREIGN KEY ("job_order_id") REFERENCES "job_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_order_spare_parts" ADD CONSTRAINT "job_order_spare_parts_spare_part_id_fkey" FOREIGN KEY ("spare_part_id") REFERENCES "spare_parts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance" ADD CONSTRAINT "maintenance_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_schedule_items" ADD CONSTRAINT "maintenance_schedule_items_maintenance_standard_id_fkey" FOREIGN KEY ("maintenance_standard_id") REFERENCES "maintenance_standards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_maintenance_tracking" ADD CONSTRAINT "vehicle_maintenance_tracking_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_maintenance_tracking" ADD CONSTRAINT "vehicle_maintenance_tracking_maintenance_schedule_item_id_fkey" FOREIGN KEY ("maintenance_schedule_item_id") REFERENCES "maintenance_schedule_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_completion_logs" ADD CONSTRAINT "maintenance_completion_logs_vehicle_maintenance_tracking_i_fkey" FOREIGN KEY ("vehicle_maintenance_tracking_id") REFERENCES "vehicle_maintenance_tracking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_completion_logs" ADD CONSTRAINT "maintenance_completion_logs_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tools" ADD CONSTRAINT "tools_borrowed_by_fkey" FOREIGN KEY ("borrowed_by") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borrow_requests" ADD CONSTRAINT "borrow_requests_tool_id_fkey" FOREIGN KEY ("tool_id") REFERENCES "tools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borrow_requests" ADD CONSTRAINT "borrow_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borrow_requests" ADD CONSTRAINT "borrow_requests_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gps_data" ADD CONSTRAINT "gps_data_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gps_data" ADD CONSTRAINT "gps_data_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trip_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geofence_violation" ADD CONSTRAINT "geofence_violation_geofence_id_fkey" FOREIGN KEY ("geofence_id") REFERENCES "geofence_area"("geofence_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geofence_violation" ADD CONSTRAINT "geofence_violation_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trip_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_status_audit" ADD CONSTRAINT "vehicle_status_audit_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
