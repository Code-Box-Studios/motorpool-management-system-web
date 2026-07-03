import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../lib/prisma.js';
import { truncateAll } from './db.js';

describe('test database wiring', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('talks to the mms_test database, not the dev database', () => {
    expect(process.env.DATABASE_URL).toContain('mms_test');
  });

  it('round-trips a row and truncates it', async () => {
    await prisma.role.create({ data: { name: 'roundtrip-check' } });
    expect(await prisma.role.count()).toBe(1);
    await truncateAll();
    expect(await prisma.role.count()).toBe(0);
  });
});
