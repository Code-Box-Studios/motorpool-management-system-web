import { describe, expect, it } from 'vitest';
import type { Request } from 'express';
import { requireIdParam, requireParam, requireUser } from './http.js';
import { AppError } from './errors.js';

function fakeReq(over: Partial<Request>): Request {
  return over as Request;
}

describe('http helpers', () => {
  it('requireIdParam returns a string id, rejects missing/array', () => {
    expect(requireIdParam(fakeReq({ params: { id: 'abc' } }))).toBe('abc');
    expect(() => requireIdParam(fakeReq({ params: {} }))).toThrow(AppError);
    expect(() => requireIdParam(fakeReq({ params: { id: ['a', 'b'] as unknown as string } }))).toThrow(AppError);
  });

  it('requireParam returns a named param or throws', () => {
    expect(requireParam(fakeReq({ params: { itemId: 'x' } }), 'itemId')).toBe('x');
    expect(() => requireParam(fakeReq({ params: {} }), 'itemId')).toThrow(AppError);
  });

  it('requireUser returns req.user or throws 401', () => {
    const user = { id: 'u1', email: 'a@b.c', role: 'admin', branchId: null };
    expect(requireUser(fakeReq({ user }))).toBe(user);
    expect(() => requireUser(fakeReq({}))).toThrow(AppError);
  });
});
