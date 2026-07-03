import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { config } from '../config.js';
import { AppError } from './errors.js';
import { signAccessToken, verifyAccessToken } from './jwt.js';

const payload = {
  sub: '11111111-1111-4111-8111-111111111111',
  email: 'admin@mms.local',
  role: 'admin',
  branchId: null
};

describe('access tokens', () => {
  it('round-trips the payload', () => {
    const token = signAccessToken(payload);
    expect(verifyAccessToken(token)).toEqual(payload);
  });

  it('rejects a tampered token with a 401 AppError', () => {
    const token = signAccessToken(payload) + 'x';
    expect(() => verifyAccessToken(token)).toThrowError(AppError);
    try {
      verifyAccessToken(token);
    } catch (e) {
      expect((e as AppError).statusCode).toBe(401);
    }
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign(
      { email: payload.email, role: payload.role, branchId: payload.branchId },
      config.jwtSecret,
      { subject: payload.sub, expiresIn: -1 }
    );
    expect(() => verifyAccessToken(expired)).toThrowError(AppError);
  });
});
