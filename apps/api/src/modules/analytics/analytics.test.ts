import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import {
  authHeader,
  createTestBranch,
  createTestUser
} from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';
import * as repo from './repository.js';

const app = createApp();

async function adminHeader() {
  const { user } = await createTestUser({
    email: 'a@test.local',
    role: 'admin'
  });
  return authHeader(user.id, user.email, 'admin');
}

async function vehicle(status: string, mileage = 1000) {
  // A fresh branch per call: branch names are now case-insensitively unique,
  // and this helper is called several times in one test.
  const branch = await createTestBranch(`Test Branch ${Math.random()}`);
  return prisma.vehicle.create({
    data: {
      make: 'Toyota',
      model: 'Hiace',
      year: 2021,
      vin: `V${Math.random()}`,
      licensePlate: `P${Math.random()}`,
      capacity: 5,
      fuelType: 'diesel',
      mileage,
      status: status as never,
      branchId: branch.id,
      insuranceExpiry: new Date('2027-01-01'),
      registrationExpiry: new Date('2027-01-01')
    }
  });
}

describe('analytics module', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('GET /analytics/dashboard returns status buckets + completedTrips', async () => {
    const header = await adminHeader();
    await vehicle('available');
    await vehicle('available');
    await vehicle('under_maintenance');
    const v = await vehicle('on_trip');
    const driver = await prisma.driver.create({
      data: { email: 'd@t.local', fullName: 'D', status: 'active' }
    });
    await prisma.tripTicket.create({
      data: {
        branchId: (await createTestBranch()).id,
        driverId: driver.id,
        vehicleId: v.id,
        destination: 'X',
        purpose: 'Y',
        dateRequested: new Date('2026-07-01'),
        preparedBy: '',
        status: 'completed'
      }
    });

    const res = await request(app)
      .get('/api/analytics/dashboard')
      .set('Authorization', header);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      available: 2,
      underMaintenance: 1,
      onTrip: 1,
      completedTrips: 1
    });
    expect(res.body.total).toBe(4);
  });

  it('GET /analytics/predictive-maintenance scores every vehicle', async () => {
    const header = await adminHeader();
    const v = await vehicle('available', 100000);
    await prisma.maintenance.create({
      data: {
        vehicleId: v.id,
        type: 'service',
        date: new Date('2020-01-01'),
        mileage: 0
      }
    });
    const res = await request(app)
      .get('/api/analytics/predictive-maintenance')
      .set('Authorization', header);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.data[0]).toHaveProperty('riskScore');
    expect(res.body.data[0]).toHaveProperty('priority');
    expect(res.body.data[0]).toHaveProperty('usedFallback');
    expect(res.body.data[0].kmSinceLastMaint).toBe(100000); // 100000 - 0
    // client-dt-brief.md §4: the cross-check is additive — every existing
    // field is still exactly as before, plus these two new ones.
    expect(res.body.data[0]).toHaveProperty('crossCheckModel');
    expect(typeof res.body.data[0].crossCheckModel).toBe('string');
    expect(
      res.body.data[0].crossCheckScore === null ||
        typeof res.body.data[0].crossCheckScore === 'number'
    ).toBe(true);
  });

  // Round-4 review #5: `null || a number` is true of every possible response —
  // the client model failing to load, being wired to the wrong features, or
  // working correctly all pass it identically. These two pin real, expected
  // numbers instead. Golden values and the tree path (root MAINT_FREQ_12M >
  // 0.5 -> right; KM_SINCE_LAST_MAINT <= 26557.935546875 -> left; the
  // downtime_hours leaf, threshold 0.8223991990089417) are read straight off
  // client-dt.test.ts, which pins the same client_dt_model.json this endpoint
  // loads.
  it("GET /analytics/predictive-maintenance returns the model's actual score, not just null-or-a-number", async () => {
    const header = await adminHeader();
    const v = await vehicle('available', 10000);
    // KM_SINCE_LAST_MAINT = 10000 - 0. MAINT_FREQ_12M = 1 (one record, dated
    // "now", always inside the trailing-12-months window).
    await prisma.maintenance.create({
      data: { vehicleId: v.id, type: 'service', date: new Date(), mileage: 0 }
    });
    // A CLOSED 0.5h under_maintenance span — below the 0.822...h split. Closed
    // because a later row exists, so the query's COALESCE(next, now) branch
    // never runs and this is exact regardless of when the test executes.
    const start = new Date(Date.now() - 6 * 60 * 60 * 1000);
    await prisma.vehicleStatusAudit.create({
      data: {
        vehicleId: v.id,
        oldStatus: 'available',
        newStatus: 'under_maintenance',
        changeSource: 'manual_edit',
        createdAt: start
      }
    });
    await prisma.vehicleStatusAudit.create({
      data: {
        vehicleId: v.id,
        oldStatus: 'under_maintenance',
        newStatus: 'available',
        changeSource: 'manual_edit',
        createdAt: new Date(start.getTime() + 0.5 * 60 * 60 * 1000)
      }
    });

    const res = await request(app)
      .get('/api/analytics/predictive-maintenance')
      .set('Authorization', header);
    expect(res.status).toBe(200);
    const score = res.body.data[0].crossCheckScore;
    expect(typeof score).toBe('number');
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
    expect(score).toBeCloseTo(0.7419354838709677, 10);
  });

  it('two vehicles straddling the same tree split get different crossCheckScores', async () => {
    const header = await adminHeader();
    const below = await vehicle('available', 10000);
    const above = await vehicle('available', 10000);
    for (const v of [below, above]) {
      await prisma.maintenance.create({
        data: { vehicleId: v.id, type: 'service', date: new Date(), mileage: 0 }
      });
    }
    const start = new Date(Date.now() - 6 * 60 * 60 * 1000);
    // below: 0.5h downtime (under the split); above: 1h (over it). Identical
    // KM_SINCE_LAST_MAINT/MAINT_FREQ_12M on both — only downtime_hours
    // differs — so a difference in score can only come from the tree
    // actually being traversed on that feature, not a constant leaf.
    await prisma.vehicleStatusAudit.createMany({
      data: [
        {
          vehicleId: below.id,
          oldStatus: 'available',
          newStatus: 'under_maintenance',
          changeSource: 'manual_edit',
          createdAt: start
        },
        {
          vehicleId: below.id,
          oldStatus: 'under_maintenance',
          newStatus: 'available',
          changeSource: 'manual_edit',
          createdAt: new Date(start.getTime() + 0.5 * 60 * 60 * 1000)
        },
        {
          vehicleId: above.id,
          oldStatus: 'available',
          newStatus: 'under_maintenance',
          changeSource: 'manual_edit',
          createdAt: start
        },
        {
          vehicleId: above.id,
          oldStatus: 'under_maintenance',
          newStatus: 'available',
          changeSource: 'manual_edit',
          createdAt: new Date(start.getTime() + 1 * 60 * 60 * 1000)
        }
      ]
    });

    const res = await request(app)
      .get('/api/analytics/predictive-maintenance')
      .set('Authorization', header);
    expect(res.status).toBe(200);
    const byId = new Map<string, number | null>(
      res.body.data.map(
        (d: { vehicleId: string; crossCheckScore: number | null }) => [
          d.vehicleId,
          d.crossCheckScore
        ]
      )
    );
    const belowScore = byId.get(below.id);
    const aboveScore = byId.get(above.id);
    expect(typeof belowScore).toBe('number');
    expect(typeof aboveScore).toBe('number');
    expect(belowScore).not.toBe(aboveScore);
    expect(belowScore).toBeCloseTo(0.7419354838709677, 10);
    expect(aboveScore).toBe(1.0);
  });

  it('GET /analytics/association-rules mines the job-order spare-parts join', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();
    const v = await vehicle('available');
    const partA = await prisma.sparePart.create({
      data: { name: 'Brake Pad' }
    });
    const partB = await prisma.sparePart.create({ data: { name: 'Rotor' } });
    // Two job orders each using both parts → a co-occurrence.
    for (let i = 0; i < 2; i++) {
      const jo = await prisma.jobOrder.create({
        data: { vehicleId: v.id, branchId: branch.id, status: 'repaired' }
      });
      await prisma.jobOrderSparePart.createMany({
        data: [
          { jobOrderId: jo.id, sparePartId: partA.id, quantity: 1 },
          { jobOrderId: jo.id, sparePartId: partB.id, quantity: 1 }
        ]
      });
    }
    const res = await request(app)
      .get('/api/analytics/association-rules')
      .set('Authorization', header);
    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThanOrEqual(1);
    const rule = res.body.data[0];
    expect([rule.partA, rule.partB].sort()).toEqual(['Brake Pad', 'Rotor']);
  });

  it('uses the selected vehicle risk method while keeping association models out of vehicle scoring', async () => {
    const header = await adminHeader();
    const v = await vehicle('available', 0);
    const estimate = await request(app)
      .get('/api/analytics/predictive-maintenance?algorithm=usage_rules')
      .set('Authorization', header);
    expect(estimate.status).toBe(200);
    expect(estimate.body.data[0]).toMatchObject({
      vehicleId: v.id,
      riskScore: 25,
      priority: 'low',
      usedFallback: true,
      scoringMethod: 'usage_rules'
    });
    const forest = await request(app)
      .get('/api/analytics/predictive-maintenance?algorithm=random_forest')
      .set('Authorization', header);
    expect(forest.status).toBe(200);
    expect(forest.body.data[0].scoringMethod).toBe('random_forest');
    expect(forest.body.data[0].usedFallback).toBe(false);
    expect(forest.body.data[0].riskScore).not.toBe(
      estimate.body.data[0].riskScore
    );
    for (const algorithm of ['eclat', 'fp_growth', 'unknown']) {
      expect(
        (
          await request(app)
            .get(`/api/analytics/predictive-maintenance?algorithm=${algorithm}`)
            .set('Authorization', header)
        ).status
      ).toBe(400);
    }
  });

  it.each(['fp_growth', 'eclat'])(
    'runs the supplied %s association model without live job orders',
    async (algorithm) => {
      const header = await adminHeader();
      const res = await request(app)
        .get(`/api/analytics/association-models?algorithm=${algorithm}`)
        .set('Authorization', header);
      expect(res.status).toBe(200);
      expect(res.body.algorithm).toBe(algorithm);
      expect(res.body.trainingTransactions).toBe(21);
      expect(res.body.minSupport).toBeCloseTo(2 / 21, 12);
      expect(res.body.count).toBe(4);
      expect(res.body.data).toHaveLength(4);
      expect(res.body.data).toContainEqual({
        antecedent: 'Fuel Filter',
        consequent: 'Oil Filter',
        support: 4 / 21,
        confidence: 1,
        lift: 3,
        coOccurrences: 4
      });
      const reverse = res.body.data.find(
        (rule: { antecedent: string; consequent: string }) =>
          rule.antecedent === 'Oil Filter' && rule.consequent === 'Fuel Filter'
      );
      expect(reverse.confidence).toBeCloseTo(4 / 7, 12);
      expect(reverse.support).toBeCloseTo(4 / 21, 12);
    }
  );

  it('defaults to FP-Growth and rejects an unknown association algorithm', async () => {
    const header = await adminHeader();
    const defaultResult = await request(app)
      .get('/api/analytics/association-models')
      .set('Authorization', header);
    expect(defaultResult.status).toBe(200);
    expect(defaultResult.body.algorithm).toBe('fp_growth');
    const invalid = await request(app)
      .get('/api/analytics/association-models?algorithm=random_forest')
      .set('Authorization', header);
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('403 for non-admin/non-evp roles on every analytics endpoint', async () => {
    const { user } = await createTestUser({
      email: 'r@test.local',
      role: 'requester'
    });
    const h = authHeader(user.id, user.email, 'requester');
    for (const path of [
      '/api/analytics/dashboard',
      '/api/analytics/predictive-maintenance',
      '/api/analytics/association-rules',
      '/api/analytics/association-models?algorithm=eclat'
    ]) {
      expect(
        (await request(app).get(path).set('Authorization', h)).status
      ).toBe(403);
    }
  });

  // client-dt-brief.md §2/§5: downtime_hours computed straight off
  // vehicle_status_audit via a raw LEAD() query (no window functions in
  // Prisma's query builder).
  describe('repo.downtimeHoursByVehicle (raw vehicle_status_audit query)', () => {
    it('sums a closed span, extends an open span to `now`, and omits a vehicle with no rows', async () => {
      const closed = await vehicle('available');
      const open = await vehicle('under_maintenance');
      const none = await vehicle('available');

      // closed: exactly 5 hours under_maintenance.
      await prisma.vehicleStatusAudit.create({
        data: {
          vehicleId: closed.id,
          oldStatus: 'available',
          newStatus: 'under_maintenance',
          changeSource: 'manual_edit',
          createdAt: new Date('2026-01-01T00:00:00.000Z')
        }
      });
      await prisma.vehicleStatusAudit.create({
        data: {
          vehicleId: closed.id,
          oldStatus: 'under_maintenance',
          newStatus: 'available',
          changeSource: 'manual_edit',
          createdAt: new Date('2026-01-01T05:00:00.000Z')
        }
      });

      // open: still under_maintenance, no closing row — counts to `now`.
      await prisma.vehicleStatusAudit.create({
        data: {
          vehicleId: open.id,
          oldStatus: 'available',
          newStatus: 'under_maintenance',
          changeSource: 'manual_edit',
          createdAt: new Date('2026-01-01T00:00:00.000Z')
        }
      });

      const now = new Date('2026-01-01T03:00:00.000Z');
      const hours = await repo.downtimeHoursByVehicle(now);

      expect(hours.get(closed.id)).toBeCloseTo(5, 5);
      expect(hours.get(open.id)).toBeCloseTo(3, 5); // 00:00 → now (03:00)
      expect(hours.has(none.id)).toBe(false); // 0 audit rows → absent, not 0
    });

    it('classifies direction by new_status, never by change_source — a job-order-deletion close still closes', async () => {
      // Reproduces job-orders/transitions.ts's `note` (opens, source
      // job_order_note) followed by job-orders/service.ts's deletion path
      // (closes to `available`, source ALSO job_order_note — a close
      // carrying the open's source). Branching on change_source would read
      // the second row as another open instead of a close.
      const v = await vehicle('available');
      await prisma.vehicleStatusAudit.create({
        data: {
          vehicleId: v.id,
          oldStatus: 'available',
          newStatus: 'under_maintenance',
          changeSource: 'job_order_note',
          createdAt: new Date('2026-01-01T00:00:00.000Z')
        }
      });
      await prisma.vehicleStatusAudit.create({
        data: {
          vehicleId: v.id,
          oldStatus: 'under_maintenance',
          newStatus: 'available',
          changeSource: 'job_order_note',
          reason: 'job order deleted',
          createdAt: new Date('2026-01-01T02:00:00.000Z')
        }
      });

      const hours = await repo.downtimeHoursByVehicle(
        new Date('2026-06-01T00:00:00.000Z') // far past the close — must NOT count as open
      );
      expect(hours.get(v.id)).toBeCloseTo(2, 5);
    });
  });
});
