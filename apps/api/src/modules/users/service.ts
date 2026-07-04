import type { CreateUserBody, UserResponse, UsersListQuery } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { toSkipTake } from '../../lib/pagination.js';
import { hashPassword } from '../../lib/password.js';
import { prisma } from '../../lib/prisma.js';
import { findUserByEmail, listUsers, userInclude, type UserRow } from './repository.js';

// Maps a Prisma user row (with its role join) to the API response shape.
export function toUserResponse(user: UserRow): UserResponse {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
    status: user.status,
    branchId: user.branchId,
    role: user.userRole?.role.name ?? null,
    createdAt: user.createdAt.toISOString()
  };
}

// Lists users, optionally filtered by role name, with pagination.
export async function list(query: UsersListQuery) {
  const { data, count } = await listUsers(query.role, toSkipTake(query));
  return { data: data.map(toUserResponse), count };
}

// Creates a login; for the driver role, also creates or links the drivers row.
export async function create(
  body: CreateUserBody,
  avatarPath: string | null
): Promise<UserResponse> {
  if (await findUserByEmail(body.email)) {
    throw new AppError(409, 'EMAIL_TAKEN', 'A user with this email already exists');
  }
  const role = await prisma.role.findUnique({ where: { id: body.roleId } });
  if (!role) {
    throw new AppError(400, 'INVALID_ROLE', 'Unknown role');
  }
  const passwordHash = await hashPassword(body.password);

  // Spec §6: creating a driver-role user also gets a linked drivers row —
  // the app's only signup-driven driver-creation path. If a personnel record
  // with this email already exists (created via POST /drivers), LINK it
  // instead of colliding with the drivers.email unique constraint; if it's
  // already linked to another login, that's a conflict. One transaction.
  const existingDriver =
    role.name === 'driver'
      ? await prisma.driver.findUnique({ where: { email: body.email } })
      : null;
  if (existingDriver && existingDriver.userId !== null) {
    throw new AppError(409, 'EMAIL_TAKEN', 'This driver already has a login');
  }

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: body.email,
        passwordHash,
        fullName: body.fullName,
        branchId: body.branchId,
        phone: body.phone,
        address: body.address,
        avatarUrl: avatarPath,
        userRole: { create: { roleId: role.id } }
      },
      include: userInclude
    });
    if (role.name === 'driver') {
      if (existingDriver) {
        await tx.driver.update({
          where: { id: existingDriver.id },
          data: { userId: user.id }
        });
      } else {
        await tx.driver.create({
          data: {
            userId: user.id,
            email: user.email,
            fullName: user.fullName,
            branchId: user.branchId,
            status: 'active'
          }
        });
      }
    }
    return user;
  });
  return toUserResponse(created);
}
