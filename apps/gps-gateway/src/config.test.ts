import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

// Every case passes an explicit env object, so process.env is never touched.
const BASE = {
  MMS_API_URL: 'http://localhost:3001',
  GPS_DEVICE_API_KEY: 'test-device-key'
};

describe('gateway config', () => {
  it('applies defaults', () => {
    const config = loadConfig({ ...BASE });
    expect(config.tcpPort).toBe(5013);
    expect(config.apiUrl).toBe('http://localhost:3001');
    expect(config.speedUnit).toBe('knots');
    expect(config.registryCacheTtlMs).toBeGreaterThan(0);
  });

  it('fails closed when the device key is missing', () => {
    expect(() => loadConfig({ MMS_API_URL: 'http://localhost:3001' })).toThrow();
  });

  it('rejects an unknown speed unit', () => {
    expect(() => loadConfig({ ...BASE, SPEED_UNIT: 'furlongs' })).toThrow();
  });

  it('strips a trailing slash from the API url', () => {
    expect(loadConfig({ ...BASE, MMS_API_URL: 'http://x/' }).apiUrl).toBe('http://x');
  });
});
