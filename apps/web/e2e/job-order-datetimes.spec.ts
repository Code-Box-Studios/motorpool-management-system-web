import { expect, test } from '@playwright/test';

for (const timezoneId of ['Asia/Manila', 'Europe/Malta']) {
  test.describe(timezoneId, () => {
    test.use({ timezoneId });
    test('repair adapters send explicit instants for incident, acceptance, target and release', async ({
      page
    }) => {
      const sent: {
        method: string;
        path: string;
        body: Record<string, unknown>;
      }[] = [];
      await page.route('**/review-empty', (route) =>
        route.fulfill({ contentType: 'text/html', body: '<html></html>' })
      );
      await page.route(/^https?:\/\/[^/]+\/api\//, (route) => {
        sent.push({
          method: route.request().method(),
          path: new URL(route.request().url()).pathname,
          body: route.request().postDataJSON()
        });
        return route.fulfill({ json: { id: 'clock-order' } });
      });
      await page.goto('/review-empty');
      const expected = await page.evaluate(async () => {
        const modulePath = '/src/lib/api/job-orders.ts';
        const source = await (await fetch(modulePath)).text();
        const clientPath = source.match(
          /from\s+["']([^"']*client[^"']*)["']/
        )![1];
        const client = await import(/* @vite-ignore */ clientPath);
        client.setAccessToken('clock-fixture-token');
        client.setSessionIdentity('clock-fixture-user');
        const orders = await import(/* @vite-ignore */ modulePath);
        const local = '2026-11-13T00:30';
        await orders.createJobOrder({ incident_date: local });
        await orders.updateJobOrder('clock-order', { incident_date: local });
        await orders.noteJobOrder('clock-order', {
          assignedMechanicId: 'clock-mechanic',
          dateOfRequest: local,
          targetDate: local,
          spareParts: []
        });
        await orders.completeRepairJobOrder('clock-order', {
          repairDone: 'simple',
          completedMileage: 1000,
          actualDateOfRelease: local
        });
        return new Date(local).toISOString();
      });
      expect(
        sent.map(
          ({ body }) =>
            body.incidentDate ?? body.dateOfRequest ?? body.actualDateOfRelease
        )
      ).toEqual([expected, expected, expected, expected]);
      expect(sent[2].body.targetDate).toBe(expected);
    });
  });
}
