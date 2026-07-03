/*
  Warnings:

  - You are about to drop the column `completedMileage` on the `maintenance_completion_logs` table. All the data in the column will be lost.
  - Added the required column `completed_mileage` to the `maintenance_completion_logs` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "maintenance_completion_logs" DROP COLUMN "completedMileage",
ADD COLUMN     "completed_mileage" INTEGER NOT NULL;
