-- CreateIndex
CREATE UNIQUE INDEX "vehicle_maintenance_tracking_vehicle_id_maintenance_schedul_key" ON "vehicle_maintenance_tracking"("vehicle_id", "maintenance_schedule_item_id");
