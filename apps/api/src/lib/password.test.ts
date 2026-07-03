import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('verifies a correct password against its hash', async () => {
    const hash = await hashPassword('Password123!');
    expect(hash).not.toBe('Password123!');
    expect(await verifyPassword('Password123!', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('Password123!');
    expect(await verifyPassword('nope', hash)).toBe(false);
  });
});
