import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
  branchId: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

// Resolve authority from the current account, not from stale JWT role claims.
export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(new AppError(401, 'UNAUTHORIZED', 'Missing bearer token'));
    return;
  }
  try {
    const payload = verifyAccessToken(header.slice('Bearer '.length));
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        branchId: true,
        status: true,
        authVersion: true,
        userRole: { select: { role: { select: { name: true } } } }
      }
    });
    const role = user?.userRole?.role.name;
    if (
      !user ||
      user.status !== 'active' ||
      !role ||
      user.authVersion !== payload.authVersion
    ) {
      throw new AppError(
        401,
        'UNAUTHORIZED',
        'Session is no longer valid; sign in again'
      );
    }
    req.user = {
      id: user.id,
      email: user.email,
      role,
      branchId: user.branchId
    };
    next();
  } catch (err) {
    next(err);
  }
}
