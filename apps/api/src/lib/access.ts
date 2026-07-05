import { USER_ROLES } from '@mms/shared';
import type { UserRole } from '../middleware/require-role.js';

// Spec §5 read matrix: maintenance, spare-parts, and tools are readable by
// every role EXCEPT security_guard (whose dashboard renders none of them).
// Codified once so the asymmetric gate can't drift between the three modules.
export const INVENTORY_READ_ROLES: UserRole[] = [
  USER_ROLES.admin,
  USER_ROLES.requester,
  USER_ROLES.evp_operations,
  USER_ROLES.driver
];
