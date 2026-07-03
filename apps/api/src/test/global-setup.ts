import { execSync } from 'node:child_process';
import { config as loadEnv } from 'dotenv';

// Applies all migrations to the dedicated test database once per test run.
export default function setup(): void {
  loadEnv({ path: '.env' });
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set');
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit'
  });
}
