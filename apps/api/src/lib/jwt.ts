import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { AppError } from './errors.js';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: string;
  branchId: string | null;
}

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

// Sign a short-lived access JWT carrying the caller's identity + role.
export function signAccessToken(payload: AccessTokenPayload): string {
  const { sub, ...claims } = payload;
  return jwt.sign(claims, config.jwtSecret, {
    subject: sub,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS
  });
}

// Verify + decode an access JWT; any failure maps to a 401 AppError.
export function verifyAccessToken(token: string): AccessTokenPayload {
  let decoded: string | jwt.JwtPayload;
  try {
    decoded = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired token');
  }
  if (
    typeof decoded === 'string' ||
    typeof decoded.sub !== 'string' ||
    typeof decoded.email !== 'string' ||
    typeof decoded.role !== 'string'
  ) {
    throw new AppError(401, 'UNAUTHORIZED', 'Malformed token payload');
  }
  return {
    sub: decoded.sub,
    email: decoded.email,
    role: decoded.role,
    branchId: typeof decoded.branchId === 'string' ? decoded.branchId : null
  };
}
