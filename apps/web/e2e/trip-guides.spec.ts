import { test, expect, type Page, type Locator } from '@playwright/test';
import {
  login,
  shot,
  CREDENTIALS,
  apiLogin,
  apiGet,
  apiPost,
  apiDelete,
  listData,
  API_URL,
  pickDate
} from './helpers';

// Guide accounts are active drivers or requesters from any branch. Verify the
// picker, booking payload, persisted read and detail adapter together.
const createdTicketIds: string[] = [];
const createdUserIds: string[] = [];

test.afterAll(async ({ request }) => {
  const admin = await apiLogin(request, CREDENTIALS.admin);

  for (const id of createdTicketIds) {
    try {
      const del = await apiDelete(
        request,
        `/api/trip-tickets/${id}`,
        admin.token
      );
      if (!del.ok) {
        const cancel = await apiPost(
          request,
          `/api/trip-tickets/${id}/cancel`,
          admin.token,
          { reason: 'e2e: trip-guides teardown' }
        );
        if (!cancel.ok) {
          console.error(
            `trip-guides cleanup: ticket ${id} could neither be deleted ` +
              `(HTTP ${del.status}) nor cancelled (HTTP ${cancel.status})`
          );
        }
      }
    } catch (err) {
      console.error(
        `trip-guides cleanup: tearing down ticket ${id} threw:`,
        err
      );
    }
  }

  for (const id of createdUserIds) {
    const deleted = await apiDelete(request, `/api/users/${id}`, admin.token);
    if (!deleted.ok) {
      const response = await request.patch(`${API_URL}/api/users/${id}`, {
        headers: { Authorization: `Bearer ${admin.token}` },
        data: { status: 'inactive' }
      });
      expect(
        response.ok(),
        'referenced test guides can be deactivated'
      ).toBeTruthy();
    }
  }
});

// ---------- Local helpers, specific to this spec's UI paths ----------

// The same booking dialog organization.spec.ts opens. Kept local to each spec
// rather than promoted into helpers.ts, matching how that spec already does it.
async function openBookingDialog(page: Page): Promise<Locator> {
  await page
    .getByRole('link', { name: 'Trip Tickets', exact: true })
    .first()
    .click();
  await page.waitForURL(/\/trip-tickets/, { timeout: 15_000 });
  await page.getByRole('button', { name: 'Create Trip Ticket' }).click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByText('Submit a trip ticket request for admin approval.')
  ).toBeVisible({ timeout: 15_000 });
  return dialog;
}

// The booking form's labels point at controls with no matching id (see
// organization.spec.ts:112-121), so a field is reached through the role="group"
// its Field wrapper renders, filtered by a word unique to that field.
function fieldGroup(dialog: Locator, label: string): Locator {
  return dialog.getByRole('group').filter({ hasText: label });
}

// Picks the first real option in a Select. The empty state inside
// SelectContent is a plain <div>, not an option, so first() can only ever
// match a real row.
async function pickFirstOption(page: Page, trigger: Locator): Promise<void> {
  await trigger.click();
  const option = page.getByRole('option').first();
  await expect(option).toBeVisible({ timeout: 15_000 });
  await option.click();
}

// Reads one fact out of the review step: every value is a <dd> next to its
// <dt> (components/shared/detail-view.tsx).
function detailValue(page: Page, label: string): Locator {
  return page.locator(
    `xpath=//dt[normalize-space()=${JSON.stringify(label)}]/following-sibling::dd[1]`
  );
}

test('a guide picked on the booking form rides along on the ticket', async ({
  page,
  request
}) => {
  const admin = await apiLogin(request, CREDENTIALS.admin);

  const branches = listData(
    await apiGet(request, '/api/branches', admin.token)
  );
  const branch = branches.find((b) => b.name === 'Main Branch') ?? branches[0];
  expect(branch).toBeTruthy();
  const roles = listData(
    await apiGet(request, '/api/roles?all=true', admin.token)
  );
  const requesterRole = roles.find((r) => r.name === 'requester');
  expect(requesterRole).toBeTruthy();
  const guideName = `E2E Guide ${Date.now()}`;
  const guide = await apiPost(request, '/api/users', admin.token, {
    email: `guide-${Date.now()}@e2e.local`,
    password: 'Password123!',
    fullName: guideName,
    roleId: requesterRole!.id as string
  });
  expect(guide.ok, 'admin creates a requester guide account').toBeTruthy();
  createdUserIds.push((guide.body as { id: string }).id);

  await login(page, 'admin');
  const dialog = await openBookingDialog(page);

  await fieldGroup(dialog, 'Branch').getByRole('combobox').click();
  await page
    .getByRole('option', { name: branch.name as string, exact: true })
    .click();
  await pickFirstOption(
    page,
    fieldGroup(dialog, 'Department/Office/College').getByRole('combobox')
  );
  await dialog.getByRole('button', { name: 'Continue' }).click();

  await pickFirstOption(
    page,
    fieldGroup(dialog, 'Vehicle').getByRole('combobox')
  );
  await pickFirstOption(
    page,
    dialog.getByRole('combobox').filter({ hasText: /^Select a driver$/ })
  );

  // Destination first, then the fields below it: the picker's suggestion
  // popover is dismissed by the next mousedown (destination-picker.tsx's
  // click-away handler), so nothing later is clicked through it.
  const destination = `TG-E2E ${Date.now()}`;
  await dialog.locator('#destination').fill(destination);
  await dialog.locator('#purpose').fill('E2E guides');
  await dialog.getByPlaceholder('Participant 1').fill('E2E Passenger');

  // The guide picker offers active driver/requester accounts from all branches.
  await dialog.getByRole('combobox', { name: 'Guide 1' }).click();
  await page
    .getByRole('option', { name: `${guideName} — Requester`, exact: true })
    .click();

  // The seat budget counts the guide, exactly as the server does
  // (assertBookable: participants PLUS guides against vehicle.capacity).
  await expect(dialog.getByText(/2 of \d+ seats \(1 guide\)/)).toBeVisible({
    timeout: 15_000
  });
  await shot(page, 'trip-guides-1-picked');

  await dialog.getByRole('button', { name: 'Continue' }).click();

  // Far-future window: the seeded demo data and every other spec share this
  // database, and an overlap fails with VEHICLE_DOUBLE_BOOKED (409) — a
  // fixture collision, not a product bug. Times default to 08:00-17:00.
  const day = new Date(Date.now() + 75 * 86_400_000);
  const isoDay = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(day.getDate()).padStart(2, '0')}`;
  await pickDate(page, dialog.locator('button[id="dates.0.date"]'), isoDay);
  await dialog.getByRole('button', { name: 'Continue' }).click();

  // The review reads the guide back by name, not by id.
  await expect(detailValue(page, 'Guides')).toContainText(guideName, {
    timeout: 15_000
  });

  await dialog.getByRole('button', { name: 'Submit Request' }).click();
  // Radix hides the OUTER dialog from the accessibility tree (aria-hidden) the
  // moment this nested alertdialog opens — before the click below, and well
  // before the booking request even starts — so `dialog` reads as "hidden"
  // immediately and would let the test race ahead of the actual POST. The
  // alertdialog itself is the reliable signal: ConfirmationModal only unmounts
  // it once the mutation's promise settles (form.tsx's handleConfirmAdd), so
  // waiting for THIS to close is waiting for the request to actually finish.
  const confirmDialog = page.getByRole('alertdialog');
  await confirmDialog.getByRole('button', { name: 'Submit Request' }).click();
  await expect(confirmDialog).toBeHidden({ timeout: 20_000 });
  // Only true on the success path (handleConfirmAdd calls onDone() from
  // inside the same .then() as the line above) — a real proof the booking
  // dialog closed because the ticket was created, not because a stacked modal
  // aria-hid it.
  await expect(dialog).toBeHidden({ timeout: 20_000 });

  // ---------- The booked ticket carries the guide ----------
  const tickets = listData(
    await apiGet(request, '/api/trip-tickets', admin.token)
  );
  const booked = tickets.find((t) => t.destination === destination) as
    | { id: string; guides: { user: { fullName: string } }[] }
    | undefined;
  // Queued for teardown the moment an id exists — before any assertion that
  // could throw and skip it. The browser already booked this ticket (the
  // dialog closed on the success path above); if the API lookup below fails
  // to resolve it, or the guides-content check after that fails, the row is
  // still real and still has to be deleted, exactly as the user id is
  // captured immediately after creation above.
  if (booked) createdTicketIds.push(booked.id);
  expect(booked, 'the booked ticket resolves via the API').toBeTruthy();
  expect(
    booked!.guides.map((g) => g.user.fullName),
    'the guide picked in the form reached the ticket'
  ).toEqual([guideName]);

  // ---------- The ticket detail page renders the guide BY NAME ----------
  // This exercises the adapter that flattens the user join into guide labels.
  await page.goto(`/trip-tickets/${booked!.id}`);
  await expect(
    page.getByRole('heading', { name: destination, exact: true })
  ).toBeVisible({ timeout: 15_000 });
  await expect(detailValue(page, 'Guides')).toContainText(guideName, {
    timeout: 15_000
  });
  // Still pending_admin_approval — reassign is only offered from
  // approved/in_progress (canReassignGuides), so the control must NOT be
  // reachable yet. Cheap, and it is the other half of "canReassignGuides
  // matches the server's allowed-from set" — the approved-state half is
  // covered by the reassign block below.
  await expect(
    page.getByRole('button', { name: 'Reassign guides' })
  ).toHaveCount(0);
  await shot(page, 'trip-guides-2-detail');

  // ---------- Approve the ticket, then confirm Reassign guides appears ----------
  // Fuel allocation (admin) takes it to pending_fuel_allocation_approval;
  // EVP approval (done via the API — a second UI login is not worth the
  // extra time for what this block exists to check) takes it to approved,
  // the state canReassignGuides actually gates on.
  await page.getByRole('button', { name: 'Approve and allocate fuel' }).click();
  const allocDialog = page.getByRole('alertdialog');
  await allocDialog.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Gasoline' }).click();
  await allocDialog.locator('#fuel-allocation-liters').fill('10');
  await allocDialog
    .getByRole('button', { name: 'Submit for Fuel Allocation Approval' })
    .click();
  await expect(allocDialog).toBeHidden({ timeout: 15_000 });

  const evp = await apiLogin(request, CREDENTIALS.evp);
  const evpApproved = await apiPost(
    request,
    `/api/trip-tickets/${booked!.id}/approve-evp`,
    evp.token,
    {}
  );
  expect(evpApproved.ok, 'evp approves the fuel allocation').toBeTruthy();

  await page.reload();
  await expect(
    page.getByRole('heading', { name: destination, exact: true })
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByRole('button', { name: 'Reassign guides' })
  ).toBeVisible({ timeout: 15_000 });
});

test('guides include active drivers and requesters from every branch and survive a branch change', async ({
  page,
  request
}) => {
  const admin = await apiLogin(request, CREDENTIALS.admin);
  const branches = listData(
    await apiGet(request, '/api/branches', admin.token)
  );
  const main = branches.find((b) => b.name === 'Main Branch')!;
  const north = branches.find((b) => b.name === 'North Branch')!;
  const options = listData(
    await apiGet(request, '/api/trip-tickets/guide-options', admin.token)
  );
  expect(options.some((g) => g.role === 'driver')).toBeTruthy();
  expect(options.some((g) => g.role === 'requester')).toBeTruthy();
  await login(page, 'admin');
  const dialog = await openBookingDialog(page);
  await fieldGroup(dialog, 'Branch').getByRole('combobox').click();
  await page
    .getByRole('option', { name: main.name as string, exact: true })
    .click();
  await pickFirstOption(
    page,
    fieldGroup(dialog, 'Department/Office/College').getByRole('combobox')
  );
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await dialog.getByRole('combobox', { name: 'Guide 1' }).click();
  for (const option of options) {
    const role = option.role === 'driver' ? 'Driver' : 'Requester';
    await expect(
      page.getByRole('option', {
        name: `${option.fullName} — ${role}`,
        exact: true
      })
    ).toBeVisible();
  }
  const selected = options.find((g) => g.role === 'requester')!;
  await page
    .getByRole('option', {
      name: `${selected.fullName} — Requester`,
      exact: true
    })
    .click();
  await dialog.getByRole('button', { name: 'Back', exact: true }).click();
  await fieldGroup(dialog, 'Branch').getByRole('combobox').click();
  await page
    .getByRole('option', { name: north.name as string, exact: true })
    .click();
  await pickFirstOption(
    page,
    fieldGroup(dialog, 'Department/Office/College').getByRole('combobox')
  );
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(dialog.getByRole('combobox', { name: 'Guide 1' })).toContainText(
    selected.fullName as string
  );
});

test('historical employee guides remain readable when reassignment opens', async ({
  page,
  request
}) => {
  const admin = await apiLogin(request, CREDENTIALS.admin);
  const tickets = listData(
    await apiGet(request, '/api/trip-tickets?all=true', admin.token)
  );
  type LegacyGuide = {
    employeeId: string | null;
    employee: { name: string } | null;
  };
  const ticket = tickets.find(
    (item) =>
      ['approved', 'in_progress', 'pending_fuel_allocation_approval'].includes(
        item.status as string
      ) && (item.guides as LegacyGuide[]).some((guide) => guide.employee)
  );
  test.skip(
    !ticket,
    'This database has no historical employee guide assignment'
  );
  const guides = ticket!.guides as LegacyGuide[];
  const index = guides.findIndex((guide) => guide.employee);
  const historicalName = guides[index].employee!.name;
  await login(page, 'admin');
  await page.goto(`/trip-tickets/${ticket!.id}`);
  await expect(detailValue(page, 'Guides')).toContainText(historicalName);
  await page.getByRole('button', { name: 'Reassign guides' }).click();
  await expect(
    page.getByRole('combobox', { name: `Guide ${index + 1}`, exact: true })
  ).toContainText(historicalName);
  await expect(
    page.getByRole('button', { name: 'Save', exact: true })
  ).toBeDisabled();
  await expect(
    page
      .getByText(
        'Choose an active driver or requester to replace this historical guide'
      )
      .first()
  ).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  const after = (await apiGet(
    request,
    `/api/trip-tickets/${ticket!.id}`,
    admin.token
  )) as { guides: LegacyGuide[] };
  expect(after.guides.map((guide) => guide.employeeId)).toEqual(
    guides.map((guide) => guide.employeeId)
  );
});
