import bcrypt from 'bcryptjs';

const BCRYPT_COST = 12;

// Hash a plaintext password (bcrypt, cost 12 per spec §5).
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

// Compare a plaintext password against a stored bcrypt hash.
export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
