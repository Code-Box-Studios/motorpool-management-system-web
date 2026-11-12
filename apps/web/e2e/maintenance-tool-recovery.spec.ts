import { expect, test, type Page } from '@playwright/test';

const V = '81000000-0000-4000-8000-000000000001';
const B = '81000000-0000-4000-8000-000000000002';
const M = '81000000-0000-4000-8000-000000000003';
const T = '81000000-0000-4000-8000-000000000005';
const D = '81000000-0000-4000-8000-000000000006';
const stamp = '2026-11-12T01:00:00.000Z';
const vehicle = {
  id: V,
  make: 'Recovery',
  model: 'Van',
  year: 2024,
  vin: 'RECOVERY-VIN',
  licensePlate: 'RECOVERY-VAN',
  capacity: 10,
  fuelType: 'diesel',
  mileage: 12000,
  status: 'available',
  images: [],
  branchId: B,
  maintenanceStandardId: null,
  insuranceExpiry: '2030-01-01',
  registrationExpiry: '2030-01-01',
  createdAt: stamp,
  updatedAt: stamp
};
const service = {
  id: M,
  vehicleId: V,
  type: 'preventive',
  date: '2026-11-12',
  cost: null,
  mileage: 12000,
  nextDue: null,
  description: 'Recorded recovery service',
  createdAt: stamp,
  updatedAt: stamp
};

async function sessionRead(page: Page) {
  await page.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
    const p = new URL(route.request().url()).pathname;
    if (route.request().method() !== 'GET')
      throw new Error(`Unexpected write: ${p}`);
    if (p === '/api/auth/me')
      return route.fulfill({
        json: {
          id: '81000000-0000-4000-8000-000000000004',
          email: 'fixture@recovery.local',
          fullName: 'Fixture Admin',
          role: 'admin',
          branchId: B,
          avatarUrl: null
        }
      });
    if (p === '/api/auth/test-accounts')
      return route.fulfill({ json: { enabled: false } });
    if (p === '/api/branches')
      return route.fulfill({
        json: {
          data: [
            { id: B, name: 'Recovery branch', location: null, archivedAt: null }
          ],
          count: 1
        }
      });
    if (p === '/api/notifications')
      return route.fulfill({ json: { data: [], unread: 0 } });
    return route.fulfill({ json: { data: [], count: 0 } });
  });
}

for (const operation of ['create', 'update', 'delete'] as const) {
  test(`maintenance ${operation} refreshes a warm preventive result without reloading`, async ({
    page
  }) => {
    await sessionRead(page);
    let serviced = operation !== 'create';
    let mileage = 12000;
    let writes = 0;
    await page.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
      const req = route.request(),
        p = new URL(req.url()).pathname;
      const send = (json: unknown, status = 200) =>
        route.fulfill({ json, status });
      if (p.startsWith('/api/maintenance') && req.method() !== 'GET') {
        writes++;
        if (operation === 'delete') {
          expect(req.method()).toBe('DELETE');
          serviced = false;
          return route.fulfill({ status: 204 });
        }
        expect(req.method()).toBe(operation === 'create' ? 'POST' : 'PATCH');
        const body = req.postDataJSON();
        serviced = true;
        mileage = body.mileage;
        return send(
          { ...service, ...body },
          operation === 'create' ? 201 : 200
        );
      }
      if (p === '/api/vehicles') return send({ data: [vehicle], count: 1 });
      if (p === '/api/maintenance')
        return send({
          data: serviced ? [{ ...service, mileage }] : [],
          count: serviced ? 1 : 0
        });
      if (p === `/api/maintenance/${M}`) return send({ ...service, mileage });
      if (p === '/api/analytics/predictive-maintenance')
        return send({
          data: [
            {
              vehicleId: V,
              make: vehicle.make,
              model: vehicle.model,
              licensePlate: vehicle.licensePlate,
              mileage: 12000,
              kmSinceLastMaint: serviced ? 0 : 6000,
              avgDailyKm: 40,
              maintFreq12m: serviced ? 2 : 1,
              riskScore: serviced ? 10 : 90,
              priority: serviced ? 'low' : 'high',
              usedFallback: false,
              scoringMethod: 'random_forest',
              lastMaintenanceDate: serviced ? service.date : '2026-10-01',
              lastMaintenanceMileage: serviced ? mileage : 6000,
              nextMaintenanceDueMileage: serviced ? mileage + 5000 : 11000,
              nextMaintenanceDueDate: null,
              preventiveStatus: serviced ? 'on_schedule' : 'overdue',
              preventiveSource: 'service_history'
            }
          ],
          count: 1
        });
      return route.fallback();
    });
    await page.goto('/maintenance?tab=preventive');
    const region = page.getByRole('region', {
      name: 'Preventive vehicles',
      exact: true
    });
    await expect(
      region.getByText(operation === 'create' ? 'Overdue' : 'On Schedule', {
        exact: true
      })
    ).toBeVisible();
    if (operation === 'create') {
      await page
        .getByRole('link', { name: 'Create Maintenance', exact: true })
        .click();
      await page.getByRole('combobox').first().click();
      await page
        .getByRole('option', {
          name: 'Recovery Van - RECOVERY-VAN',
          exact: true
        })
        .click();
      await page.locator('#date').fill('2026-11-12');
      await page.locator('#mileage').fill('12000');
      await page
        .getByRole('button', { name: 'Create Maintenance', exact: true })
        .click();
      await page
        .getByRole('alertdialog')
        .getByRole('button', { name: 'Create Maintenance', exact: true })
        .click();
    } else {
      await page.getByRole('tab', { name: 'Schedule', exact: true }).click();
      await page.getByRole('tab', { name: 'Table', exact: true }).click();
      const row = page
        .getByRole('row')
        .filter({ hasText: service.description });
      if (operation === 'update') {
        await row.getByRole('button', { name: 'View', exact: true }).click();
        await page.getByRole('button', { name: 'Edit', exact: true }).click();
        await page.locator('#mileage').fill('11900');
        await page
          .getByRole('button', { name: 'Update Maintenance', exact: true })
          .click();
        await page
          .getByRole('alertdialog')
          .getByRole('button', { name: 'Update Maintenance', exact: true })
          .click();
      } else {
        await row
          .getByRole('button', {
            name: 'Delete maintenance record',
            exact: true
          })
          .click();
        await page
          .getByRole('alertdialog')
          .getByRole('button', { name: 'Delete', exact: true })
          .click();
      }
    }
    await expect.poll(() => writes).toBe(1);
    await expect(page).toHaveURL(/\/maintenance(?:\?.*)?$/);
    await page.getByRole('tab', { name: 'Preventive', exact: true }).click();
    await expect(
      region.getByText(operation === 'delete' ? 'Overdue' : 'On Schedule', {
        exact: true
      })
    ).toBeVisible();
    await expect(
      region.getByText(
        operation === 'delete'
          ? '11,000 km'
          : operation === 'update'
            ? '16,900 km'
            : '17,000 km',
        { exact: true }
      )
    ).toBeVisible();
  });
}

for (const condition of [
  { value: 'available', label: 'Available' },
  { value: 'under_maintenance', label: 'In the shop' },
  { value: 'out_of_service', label: 'Out of service' }
]) {
  test(`returning a tool clears the loan and keeps ${condition.value} as its condition`, async ({
    page
  }) => {
    await sessionRead(page);
    let tool = {
      id: T,
      name: 'Recovery Wrench',
      description: '',
      status: 'borrowed',
      image: null,
      borrowedById: D as string | null,
      borrowedDate: '2026-11-10' as string | null,
      estimatedReturnDate: '2026-11-13' as string | null,
      createdAt: stamp,
      updatedAt: stamp
    };
    let captured: Record<string, string> | undefined;
    await page.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
      const req = route.request(),
        p = new URL(req.url()).pathname;
      const send = (json: unknown) => route.fulfill({ json });
      if (p === `/api/tools/${T}` && req.method() === 'PATCH') {
        const raw = req.postData() ?? '';
        captured = Object.fromEntries(
          [...raw.matchAll(/name="([^"]+)"\r\n\r\n([^\r]*)/g)].map((m) => [
            m[1],
            m[2]
          ])
        );
        tool = {
          ...tool,
          status: captured.status,
          borrowedById: captured.borrowedById || null,
          borrowedDate: null,
          estimatedReturnDate: null
        };
        return send(tool);
      }
      if (p === `/api/tools/${T}`) return send(tool);
      if (p === '/api/tools') return send({ data: [tool], count: 1 });
      if (p === '/api/tools/stats')
        return send({
          toolsOut: tool.borrowedById ? 1 : 0,
          overdue: 0,
          borrowsInWindow: 1,
          avgDaysOut: null,
          topBorrowed: []
        });
      if (p === '/api/drivers')
        return send({
          data: [
            {
              id: D,
              email: 'fixture@driver.local',
              fullName: 'Recovery Driver',
              status: 'active',
              branchId: B,
              userId: null,
              assignedVehicleId: null,
              photo: null,
              licenseExpiry: null,
              createdAt: stamp,
              updatedAt: stamp
            }
          ],
          count: 1
        });
      return route.fallback();
    });
    await page.goto(`/tools/${T}`);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    if (condition.value !== 'available') {
      await page.getByRole('combobox').first().click();
      await page
        .getByRole('option', { name: condition.label, exact: true })
        .click();
    }
    await page.getByRole('combobox').nth(1).click();
    await page
      .getByRole('option', { name: 'None (returned)', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Update Tool', exact: true })
      .click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Update Tool', exact: true })
      .click();
    await expect.poll(() => captured).toBeTruthy();
    expect(captured?.borrowedById).toBe('');
    expect(captured?.status).toBe(condition.value);
    await expect(page).toHaveURL(/\/tools$/);
    await page
      .locator('main')
      .getByText(tool.name, { exact: true })
      .first()
      .click();
    await expect(
      page.getByRole('heading', { name: tool.name, exact: true })
    ).toBeVisible();
    await expect(page.getByText(/^Signed out/)).toHaveCount(0);
    await expect(page.getByText('Borrowed', { exact: true })).toHaveCount(0);
  });
}
