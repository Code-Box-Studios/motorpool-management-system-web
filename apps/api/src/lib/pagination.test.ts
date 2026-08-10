import { describe, expect, it } from 'vitest';
import { paginationQuerySchema } from '@mms/shared';
import { toSkipTake } from './pagination.js';

describe('pagination', () => {
  it('returns an empty object when page and limit are omitted (full set)', () => {
    expect(toSkipTake(paginationQuerySchema.parse({}))).toEqual({});
  });

  it('computes skip/take from 1-indexed page', () => {
    expect(
      toSkipTake(paginationQuerySchema.parse({ page: '3', limit: '10' }))
    ).toEqual({
      skip: 20,
      take: 10
    });
  });

  it('defaults the missing half when only one is provided', () => {
    expect(toSkipTake(paginationQuerySchema.parse({ page: '2' }))).toEqual({
      skip: 10,
      take: 10
    });
    expect(toSkipTake(paginationQuerySchema.parse({ limit: '5' }))).toEqual({
      skip: 0,
      take: 5
    });
  });

  it('rejects out-of-range values', () => {
    expect(() => paginationQuerySchema.parse({ page: '0' })).toThrow();
    expect(() => paginationQuerySchema.parse({ limit: '201' })).toThrow();
  });
});
