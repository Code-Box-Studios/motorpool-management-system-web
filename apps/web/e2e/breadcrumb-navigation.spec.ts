import { expect, test, type Page } from '@playwright/test';

const B = '81000000-0000-4000-8000-000000000002';
const T = '81000000-0000-4000-8000-000000000005';
const D = '81000000-0000-4000-8000-000000000006';
const stamp = '2026-11-12T01:00:00.000Z';

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

for (const condition of [{ value: 'available', label: 'Available' }]) {
  test(`breadcrumb returns to Tools after leaving the ${condition.value} tool record`, async ({
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
    // The router can update the URL before the outgoing detail stops rendering.
    // Wait for the list, then click its row rather than the matching old title.
    await expect(
      page.getByRole('heading', { name: 'Tools', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'breadcrumb' })
    ).toHaveText('Tools');
    await page
      .getByRole('row')
      .filter({ hasText: tool.name })
      .getByRole('cell', { name: tool.name, exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/tools/${T}$`));
    await expect(
      page.getByRole('heading', { name: tool.name, exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'breadcrumb' })
    ).toHaveText('ToolsRecovery Wrench');
    await expect(page.getByText(/^Signed out/)).toHaveCount(0);
    await expect(page.getByText('Borrowed', { exact: true })).toHaveCount(0);
  });
}
