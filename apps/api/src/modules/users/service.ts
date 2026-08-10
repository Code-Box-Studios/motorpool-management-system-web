import { USER_ROLES } from '@mms/shared';
import type {
  ChangePasswordBody,
  CreateUserBody,
  OwnProfileResponse,
  UpdateOwnProfileBody,
  UpdateUserBody,
  UserResponse,
  UsersListQuery
} from '@mms/shared';
import type { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { toSkipTake } from '../../lib/pagination.js';
import { toOrderBy } from '../../lib/sorting.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { prisma } from '../../lib/prisma.js';
import type { AuthenticatedUser } from '../../middleware/require-auth.js';
import {
  findUserByEmail,
  findUserById,
  listUsers,
  userInclude,
  type UserRow
} from './repository.js';

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
  const orderBy = toOrderBy<Prisma.UserOrderByWithRelationInput>(
    query.sortBy,
    query.sortOrder,
    {
      fullName: (order) => ({ fullName: order }),
      // Role and branch are to-one relations — sort by their display name.
      role: (order) => ({ userRole: { role: { name: order } } }),
      branch: (order) => ({ branch: { name: order } }),
      status: (order) => ({ status: order }),
      createdAt: (order) => ({ createdAt: order })
    },
    { updatedAt: 'desc' }
  );
  const { data, count } = await listUsers(
    query.role,
    toSkipTake(query),
    orderBy
  );
  return { data: data.map(toUserResponse), count };
}

// Creates a login; for the driver role, also creates or links the drivers row.
export async function create(
  body: CreateUserBody,
  avatarPath: string | null
): Promise<UserResponse> {
  if (await findUserByEmail(body.email)) {
    throw new AppError(
      409,
      'EMAIL_TAKEN',
      'A user with this email already exists'
    );
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
    role.name === USER_ROLES.driver
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
    if (role.name === USER_ROLES.driver) {
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

// Updates a user's profile fields and (optionally) role; admin only.
export async function update(
  id: string,
  body: UpdateUserBody,
  avatarPath: string | null
): Promise<UserResponse> {
  const existing = await findUserById(id);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'User not found');
  if (body.roleId) {
    const role = await prisma.role.findUnique({ where: { id: body.roleId } });
    if (!role) throw new AppError(400, 'INVALID_ROLE', 'Unknown role');
  }
  const updated = await prisma.$transaction(async (tx) => {
    if (body.roleId) {
      // upsert: a role-less user (403 NO_ROLE on login) must be repairable here
      await tx.userRole.upsert({
        where: { userId: id },
        update: { roleId: body.roleId },
        create: { userId: id, roleId: body.roleId }
      });
    }
    return tx.user.update({
      where: { id },
      data: {
        fullName: body.fullName,
        status: body.status,
        branchId: body.branchId,
        phone: body.phone,
        address: body.address,
        ...(avatarPath ? { avatarUrl: avatarPath } : {})
      },
      include: userInclude
    });
  });
  return toUserResponse(updated);
}

// ---- Own profile (self-service) ----

// The branch name is resolved here rather than sent as an id: the profile
// screen shows a user where they belong, and a non-admin has no branch list
// to look the id up in.
async function toOwnProfile(userId: string): Promise<OwnProfileResponse> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { ...userInclude, branch: true }
  });
  if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
    phone: user.phone,
    address: user.address,
    status: user.status,
    role: user.userRole?.role.name ?? null,
    branchId: user.branchId,
    branchName: user.branch?.name ?? null,
    createdAt: user.createdAt.toISOString()
  };
}

export function getOwnProfile(userId: string): Promise<OwnProfileResponse> {
  return toOwnProfile(userId);
}

// Self-service edit. The id comes from the verified token, never from the
// path, so there is no record to point this at but your own; and the body
// schema carries no roleId/status/branchId, so the fields that decide what a
// user may do are not writable here at all.
export async function updateOwnProfile(
  userId: string,
  body: UpdateOwnProfileBody,
  avatarPath: string | null
): Promise<OwnProfileResponse> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      fullName: body.fullName,
      phone: body.phone,
      address: body.address,
      ...(avatarPath ? { avatarUrl: avatarPath } : {})
    }
  });
  return toOwnProfile(userId);
}

// Changes a user's password; self-change requires currentPassword, admin
// changing another user's password does not. Revokes all live refresh tokens.
export async function changePassword(
  actor: AuthenticatedUser,
  targetId: string,
  body: ChangePasswordBody
): Promise<void> {
  if (actor.id !== targetId && actor.role !== USER_ROLES.admin) {
    throw new AppError(
      403,
      'FORBIDDEN',
      'You may only change your own password'
    );
  }
  const target = await findUserById(targetId);
  if (!target) throw new AppError(404, 'NOT_FOUND', 'User not found');

  // Changing YOUR OWN password always requires the current one — admins
  // included (a hijacked admin session must not be able to lock out the
  // owner). Only admin-changes-ANOTHER-user skips it. NOT 401: the FE client
  // treats 401 as an expired access token and would force a logout loop.
  if (actor.id === targetId) {
    if (
      !body.currentPassword ||
      !(await verifyPassword(body.currentPassword, target.passwordHash))
    ) {
      throw new AppError(
        400,
        'INVALID_CURRENT_PASSWORD',
        'Current password is incorrect'
      );
    }
  }
  const passwordHash = await hashPassword(body.newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: targetId }, data: { passwordHash } }),
    // Force re-login everywhere: a changed password invalidates all sessions.
    prisma.refreshToken.updateMany({
      where: { userId: targetId, revokedAt: null },
      data: { revokedAt: new Date() }
    })
  ]);
}

// Deletes a user; admins cannot delete their own account, and users
// referenced by RESTRICT FKs surface as a domain conflict instead of a 500.
export async function remove(
  actor: AuthenticatedUser,
  id: string
): Promise<void> {
  if (actor.id === id) {
    throw new AppError(
      400,
      'CANNOT_DELETE_SELF',
      'You cannot delete your own account'
    );
  }
  const existing = await findUserById(id);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'User not found');
  try {
    await prisma.user.delete({ where: { id } });
  } catch (err) {
    // Required FKs (fuel_allocations.requested_by, completion logs) RESTRICT
    // deletion — surface a domain error instead of a 500.
    if (
      err !== null &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === 'P2003'
    ) {
      throw new AppError(
        409,
        'USER_IN_USE',
        'User is referenced by existing records; deactivate instead'
      );
    }
    throw err;
  }
}
