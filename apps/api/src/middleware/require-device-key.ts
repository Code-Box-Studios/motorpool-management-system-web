import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors.js';

// Constant-time compare (length-guarded — timingSafeEqual throws on unequal
// lengths) so the device key can't be recovered via response timing.
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// Fail-CLOSED device auth (spec §10): reads GPS_DEVICE_API_KEY live from the env
// (not the cached config) so it reflects deployment/test setup at request time.
// Unset → 500 GPS_NOT_CONFIGURED; missing/mismatched header → 401.
export function requireDeviceKey(req: Request, _res: Response, next: NextFunction): void {
  const expected = process.env.GPS_DEVICE_API_KEY;
  if (!expected) {
    next(new AppError(500, 'GPS_NOT_CONFIGURED', 'GPS device key is not configured'));
    return;
  }
  const provided = req.header('x-device-api-key');
  if (!provided || !safeEqual(provided, expected)) {
    next(new AppError(401, 'INVALID_DEVICE_KEY', 'Invalid device API key'));
    return;
  }
  next();
}
