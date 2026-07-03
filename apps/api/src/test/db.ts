import { prisma } from '../lib/prisma.js';

const TABLES = [
  'refresh_tokens',
  'user_roles',
  'users',
  'roles',
  'fuel_allocations',
  'trip_tickets',
  'job_order_spare_parts',
  'job_orders',
  'maintenance_completion_logs',
  'vehicle_maintenance_tracking',
  'maintenance_schedule_items',
  'maintenance_standards',
  'maintenance',
  'borrow_requests',
  'tools',
  'spare_parts',
  'gps_data',
  'geofence_violation',
  'geofence_area',
  'vehicle_status_audit',
  'drivers',
  'vehicles',
  'department_offices',
  'office_heads',
  'branches'
];

// Empties every app table between suites; CASCADE handles FK ordering.
export async function truncateAll(): Promise<void> {
  // Guard BEFORE truncating: a misconfigured URL must never wipe the dev DB.
  if (!process.env.DATABASE_URL?.includes('mms_test')) {
    throw new Error('refusing to truncate a non-test database');
  }
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`
  );
}
