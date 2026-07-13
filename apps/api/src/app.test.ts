import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp, isAllowedOrigin } from './app.js';

describe('app skeleton', () => {
  it('GET /api/health returns ok', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('unknown routes return the error envelope', async () => {
    const res = await request(createApp()).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Route not found' }
    });
  });
});

// Vite falls back to 5174+ when 5173 is taken. If CORS only ever allowed the
// one configured port, that fallback broke every request from the browser and
// surfaced as "I can't log in".
describe('CORS', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('allows a localhost origin on a port that is not in the allowlist', async () => {
    const res = await request(createApp())
      .get('/api/health')
      .set('Origin', 'http://localhost:5174');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(
      'http://localhost:5174'
    );
  });

  it('rejects a non-localhost origin that is not in the allowlist', async () => {
    const res = await request(createApp())
      .get('/api/health')
      .set('Origin', 'https://evil.example');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows the configured origin', () => {
    expect(isAllowedOrigin('http://localhost:5173')).toBe(true);
  });

  it('does NOT wave through localhost in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    const { isAllowedOrigin: prodIsAllowedOrigin } = await import('./app.js');

    expect(prodIsAllowedOrigin('http://localhost:5174')).toBe(false);
    // The configured allowlist still works.
    expect(prodIsAllowedOrigin('http://localhost:5173')).toBe(true);
  });
});
