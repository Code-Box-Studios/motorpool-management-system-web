-- CreateEnum
CREATE TYPE "TrackerDeviceStatus" AS ENUM ('active', 'inactive', 'decommissioned');

-- CreateTable
CREATE TABLE "tracker_devices" (
    "id" UUID NOT NULL,
    "imei" TEXT NOT NULL,
    "vehicle_id" UUID,
    "label" TEXT,
    "sim_number" TEXT,
    "status" "TrackerDeviceStatus" NOT NULL DEFAULT 'active',
    "last_seen_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tracker_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tracker_devices_imei_key" ON "tracker_devices"("imei");

-- CreateIndex
CREATE INDEX "tracker_devices_vehicle_id_idx" ON "tracker_devices"("vehicle_id");

-- AddForeignKey
ALTER TABLE "tracker_devices" ADD CONSTRAINT "tracker_devices_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
