import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { config } from '../config.js';
import { AppError } from './errors.js';
import { signAccessToken, verifyAccessToken } from './jwt.js';

const payload = {
  sub: '11111111-1111-4111-8111-111111111111',
  email: 'admin@mms.local',
  role: 'admin',
  branchId: null,
  authVersion: 0
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

  it('treats a legacy token without an authVersion as version zero', () => {
    const { sub, authVersion: _version, ...claims } = payload;
    const legacy = jwt.sign(claims, config.jwtSecret, { subject: sub });
    expect(verifyAccessToken(legacy)).toEqual(payload);
  });

  it('round-trips a current nonzero credential version', () => {
    expect(
      verifyAccessToken(signAccessToken({ ...payload, authVersion: 3 }))
    ).toEqual({
      ...payload,
      authVersion: 3
    });
  });

  for (const authVersion of [-1, 0.5, '1', null]) {
    it(`rejects malformed credential version ${JSON.stringify(authVersion)}`, () => {
      const { sub, ...claims } = payload;
      const token = jwt.sign({ ...claims, authVersion }, config.jwtSecret, {
        subject: sub
      });
      expect(() => verifyAccessToken(token)).toThrowError(AppError);
    });
  }
});
