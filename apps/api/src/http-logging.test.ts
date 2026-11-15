import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('production HTTP logging', () => {
  it('removes credentials from request and response logs while keeping request diagnostics', () => {
    const child = spawnSync(
      process.execPath,
      [
        '--import',
        createRequire(import.meta.url).resolve('tsx'),
        fileURLToPath(
          new URL('./test/http-logging-fixture.ts', import.meta.url)
        )
      ],
      {
        encoding: 'utf8',
        timeout: 20_000,
        env: {
          PATH: process.env.PATH,
          NODE_ENV: 'production',
          DATABASE_URL:
            'postgresql://fixture:fixture@127.0.0.1:1/never-connect',
          JWT_SECRET: 'synthetic-fixture-secret-with-at-least-32-characters',
          UPLOADS_PROVIDER: 'local'
        }
      }
    );
    expect(child.error).toBeUndefined();
    expect(child.status, child.stderr).toBe(0);
    const logs = child.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    const completed = logs.find((entry) => entry.req?.url === '/api/health');
    expect(completed).toBeDefined();
    expect(completed.req.method).toBe('GET');
    expect(completed.res.statusCode).toBe(200);
    expect(completed.req.headers['x-request-id']).toBe(
      'public-request-metadata'
    );
    expect(completed.req.headers.authorization).toBeUndefined();
    expect(completed.req.headers.cookie).toBeUndefined();
    expect(completed.req.headers['x-device-api-key']).toBeUndefined();
    expect(completed.res.headers['set-cookie']).toBeUndefined();
    for (const sentinel of [
      'synthetic-access-token',
      'synthetic-request-refresh',
      'synthetic-request-grant',
      'synthetic-device-key',
      'synthetic-response-refresh',
      'synthetic-response-grant'
    ])
      expect(child.stdout).not.toContain(sentinel);
  });
});
