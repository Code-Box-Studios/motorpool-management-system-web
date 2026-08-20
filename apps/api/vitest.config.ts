import { defineConfig } from 'vitest/config';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env' });

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL is not set in apps/api/.env');
}

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globalSetup: './src/test/global-setup.ts',
    // Tests get the TEST database; the app code reads DATABASE_URL as usual.
    // TZ: 'UTC' pins the test process's local timezone. Without it, a test that
    // is meant to pin a host-local-vs-Manila bug (trip-ticket-guard.test.ts's
    // "resolves a Manila-morning outing...") cannot actually fail on a host
    // that already happens to be Asia/Manila — it would pass against the exact
    // regression it exists to catch. UTC is also the deployment's real cloud
    // timezone, so this is the honest thing to pin against.
    env: {
      DATABASE_URL: testDatabaseUrl,
      UPLOADS_DIR: 'uploads-test',
      TZ: 'UTC'
    },
    // Suites share one database — never run files in parallel.
    fileParallelism: false
  }
});
