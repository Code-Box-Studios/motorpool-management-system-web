import { prisma } from '../lib/prisma.js';
import { hashPassword } from '../lib/password.js';

interface CreateTestUserOptions {
  email?: string;
  role?: string;
  password?: string;
  status?: 'active' | 'inactive';
  branchId?: string;
  fullName?: string;
}

// Creates a role (idempotent) + user + user_roles row for integration tests.
export async function createTestUser(opts: CreateTestUserOptions = {}) {
  const {
    email = 'admin@test.local',
    role = 'admin',
    password = 'Password123!',
    status = 'active',
    branchId,
    fullName = 'Test User'
  } = opts;

  const roleRow = await prisma.role.upsert({
    where: { name: role },
    update: {},
    create: { name: role }
  });
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      fullName,
      status,
      branchId,
      userRole: { create: { roleId: roleRow.id } }
    }
  });
  return { user: { id: user.id, email: user.email }, password };
}
