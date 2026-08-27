-- AlterTable
ALTER TABLE "fuel_allocations" ADD COLUMN     "decided_at" TIMESTAMP(3),
ADD COLUMN     "decided_by" UUID;

-- AlterTable
ALTER TABLE "job_orders" ALTER COLUMN "date_approved" SET DATA TYPE TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "fuel_allocations_decided_at_idx" ON "fuel_allocations"("decided_at");

-- AddForeignKey
ALTER TABLE "fuel_allocations" ADD CONSTRAINT "fuel_allocations_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
