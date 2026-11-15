import express from 'express';
import request from 'supertest';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { prisma } from './prisma.js';
import { truncateAll } from '../test/db.js';
import {
  authHeader,
  createTestBranch,
  createTestUser
} from '../test/factories.js';

function server() {
  const outer = express();
  outer.use((_req, res, next) => {
    const json = res.json.bind(res);
    let first = true;
    res.json = ((body: unknown) => {
      if (first) {
        first = false;
        throw new Error('Fixture response delivery failed after commit');
      }
      return json(body);
    }) as typeof res.json;
    next();
  });
  outer.use(createApp());
  return outer;
}
let retained: string[] = [];
beforeEach(async () => {
  await truncateAll();
  retained = [];
});
afterEach(() =>
  retained.forEach((filename) => rmSync(filename, { force: true }))
);
afterAll(() => prisma.$disconnect());

describe('committed image ownership survives response failure', () => {
  it('retains the self-service avatar after its profile write commits', async () => {
    const { user } = await createTestUser();
    const response = await request(server())
      .patch('/api/users/me')
      .set('Authorization', authHeader(user.id, user.email, 'admin'))
      .field('fullName', 'Committed profile')
      .attach('avatar', Buffer.from('fixture image'), {
        filename: 'photo.png',
        contentType: 'image/png'
      });
    expect(response.status).toBe(500);
    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: user.id }
    });
    expect(stored.fullName).toBe('Committed profile');
    const filename = path.join(
      config.uploadsDir,
      stored.avatarUrl!.replace(/^\/uploads\//, '')
    );
    retained.push(filename);
    expect(existsSync(filename)).toBe(true);
  });

  it.each(['users', 'drivers', 'vehicles', 'spare-parts', 'tools'])(
    'retains %s images on create and update when the real database write committed',
    async (domain) => {
      const branch = await createTestBranch();
      const { user: admin } = await createTestUser();
      const header = authHeader(admin.id, admin.email, 'admin');
      const role = await prisma.role.upsert({
        where: { name: 'requester' },
        update: {},
        create: { name: 'requester' }
      });
      const payload: Record<string, string> =
        domain === 'users'
          ? {
              email: 'uploaded@example.invalid',
              fullName: 'Uploaded User',
              password: 'FixturePassword123!',
              roleId: role.id
            }
          : domain === 'drivers'
            ? { email: 'uploaded@example.invalid', fullName: 'Uploaded Driver' }
            : domain === 'vehicles'
              ? {
                  make: 'Toyota',
                  model: 'Hiace',
                  year: '2021',
                  vin: 'UPLOAD-VIN',
                  licensePlate: 'UPLOAD-01',
                  capacity: '12',
                  fuelType: 'diesel',
                  mileage: '1000',
                  insuranceExpiry: '2027-01-01',
                  registrationExpiry: '2027-01-01',
                  branchId: branch.id
                }
              : { name: 'Uploaded inventory' };
      const field =
        domain === 'users'
          ? 'avatar'
          : domain === 'drivers'
            ? 'photo'
            : domain === 'vehicles'
              ? 'images'
              : 'image';
      const query = async () => {
        if (domain === 'users') {
          const r = await prisma.user.findUniqueOrThrow({
            where: { email: 'uploaded@example.invalid' }
          });
          return { id: r.id, url: r.avatarUrl };
        }
        if (domain === 'drivers') {
          const r = await prisma.driver.findUniqueOrThrow({
            where: { email: 'uploaded@example.invalid' }
          });
          return { id: r.id, url: r.photo };
        }
        if (domain === 'vehicles') {
          const r = await prisma.vehicle.findFirstOrThrow({
            where: { licensePlate: 'UPLOAD-01' }
          });
          return { id: r.id, url: r.images.at(-1) };
        }
        if (domain === 'spare-parts') {
          const r = await prisma.sparePart.findFirstOrThrow({
            where: { name: 'Uploaded inventory' }
          });
          return { id: r.id, url: r.image };
        }
        const r = await prisma.tool.findFirstOrThrow({
          where: { name: 'Uploaded inventory' }
        });
        return { id: r.id, url: r.image };
      };
      const send = async (
        method: 'post' | 'patch',
        uri: string,
        fields: Record<string, string>
      ) => {
        let req = request(server())[method](uri).set('Authorization', header);
        for (const [name, value] of Object.entries(fields))
          req = req.field(name, value);
        return req.attach(field, Buffer.from('fixture image'), {
          filename: 'photo.png',
          contentType: 'image/png'
        });
      };
      const created = await send('post', `/api/${domain}`, payload);
      expect(created.status, JSON.stringify(created.body)).toBe(500);
      const stored = await query();
      expect(stored.url).toMatch(/^\/uploads\//);
      const first = path.join(
        config.uploadsDir,
        stored.url!.replace(/^\/uploads\//, '')
      );
      retained.push(first);
      expect(existsSync(first)).toBe(true);
      const changed = await send('patch', `/api/${domain}/${stored.id}`, {});
      expect(changed.status).toBe(500);
      const updated = await query();
      const second = path.join(
        config.uploadsDir,
        updated.url!.replace(/^\/uploads\//, '')
      );
      retained.push(second);
      expect(second).not.toBe(first);
      expect(existsSync(second)).toBe(true);
    }
  );
});
