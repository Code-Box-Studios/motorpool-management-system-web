import { chromium } from '@playwright/test';

const SHOTS = process.env.SHOT_DIR;
const creds = { requester: 'requester@mms.local', admin: 'admin@mms.local' };
const PASSWORD = 'Password123!';

const browser = await chromium.launch();

async function run(role) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const apiCalls = [];
  const consoleErrors = [];
  page.on('request', (r) => {
    const u = r.url();
    if (u.includes('/api/')) apiCalls.push(u.replace(/^https?:\/\/[^/]+/, ''));
  });
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  await page.goto('http://localhost:5173/login');
  await page.locator('#login-email').fill(creds[role]);
  await page.locator('#login-password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30000 });

  // Let the 5s GPS poll fire at least twice if it is going to.
  await page.waitForTimeout(12000);

  await page.screenshot({ path: `${SHOTS}/${role}.png`, fullPage: true });

  const sidebar = await page.locator('[data-slot="sidebar"], aside, [data-sidebar]').count();
  const bodyText = await page.locator('body').innerText();
  const h1 = await page.locator('h1').first().innerText().catch(() => '(none)');

  console.log(`\n########## ${role.toUpperCase()} ##########`);
  console.log('URL           :', page.url());
  console.log('H1            :', JSON.stringify(h1));
  console.log('sidebar nodes :', sidebar);
  console.log('has "Trip Tickets" link:', bodyText.includes('Trip Tickets'));
  console.log('has "Vehicle Tracking" :', bodyText.includes('Vehicle Tracking'));
  console.log('has "Available Vehicles":', bodyText.includes('Available Vehicles'));
  console.log('--- distinct API calls ---');
  console.log([...new Set(apiCalls)].sort().join('\n') || '(none)');
  console.log('--- gps/analytics calls ---');
  const bad = apiCalls.filter((u) => u.includes('/gps/') || u.includes('/analytics'));
  console.log(bad.length ? [...new Set(bad)].join('\n') : '(none)  <-- expected for requester');
  if (consoleErrors.length) {
    console.log('--- console errors ---');
    console.log(consoleErrors.slice(0, 8).join('\n'));
  }
  await ctx.close();
}

await run('requester');
await run('admin');
await browser.close();
