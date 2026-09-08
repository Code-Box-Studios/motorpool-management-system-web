import { test, expect, type Page, type Locator } from '@playwright/test';
import {
  login,
  shot,
  CREDENTIALS,
  apiLogin,
  apiGet,
  apiPost,
  apiDelete,
  listData
} from './helpers';

// Every trip is accompanied by at least one branch employee, and the booking
// form is where they are picked. This spec drives that picker in a real
// browser and then reads the ticket back through the API, because the FE
// renames guide_ids -> guideIds in exactly one place (lib/api/trip-tickets.ts)
// and a key dropped there produces no compile error and no runtime error —
// just a ticket with no guides (design §7.1). Only an end-to-end booking
// catches that.
//
// It then also opens the booked ticket's OWN detail page and reads the
// Guides row back by name. That hop is not redundant with the API-shape
// assertion below: this test's earlier assertions read either the form's own
// state (the review step) or the raw API payload (`g.employee.name`) —
// neither exercises `guideToSnake`, the function that flattens the
// TripTicketEmployee join onto its embedded employee for display. A
// regression there (e.g. mapping the join row's own id/name instead of the
// employee's) would leave every guide badge on every ticket rendering
// nothing, with this suite still green. Finally, it approves the ticket and
// confirms the admin-only Reassign guides control appears only once the
// ticket reaches a status the server actually allows the reassign endpoint
// to run from (transitions.ts's `loadInState(id, ['approved', 'in_progress'])`).

// Employees have no hard-delete route — POST /employees/:id/archive and
// /restore are all that exist — so cleanup archives what this spec created,
// per-id, the way organization.spec.ts does. Tickets DO have a delete, but
// only while still pending_admin_approval (service.remove) — and this spec
// now approves the ticket it books (to prove Reassign guides appears once
// approved), so by teardown time DELETE is refused. Cancel is the fallback:
// legal from approved too, and a cancelled ticket is terminal history that
// needs no further teardown, the same way organization.spec.ts's
// archived-parent fixture is left cancelled rather than deleted. Either way
// this runs BEFORE the employee archive so the employee is no longer held by
// a live (non-terminal) ticket (409 IN_USE).
const createdTicketIds: string[] = [];
const createdEmployeeIds: string[] = [];

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

  for (const id of createdEmployeeIds) {
    try {
      const r = await apiPost(
        request,
        `/api/employees/${id}/archive`,
        admin.token,
        {}
      );
      if (!r.ok) {
        console.error(
          `trip-guides cleanup: archiving employee ${id} failed (HTTP ${r.status})`
        );
      }
    } catch (err) {
      console.error(
        `trip-guides cleanup: archiving employee ${id} threw:`,
        err
      );
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

  // ---------- Stage an employee on the branch the trip is booked for ----------
  const branches = listData(
    await apiGet(request, '/api/branches', admin.token)
  );
  const branch = branches.find((b) => b.name === 'Main Branch') ?? branches[0];
  expect(branch, 'a branch to book against').toBeTruthy();

  const guideName = `E2E Guide ${Date.now()}`;
  const employee = await apiPost(request, '/api/employees', admin.token, {
    name: guideName,
    position: 'Tour Guide',
    phone: null,
    branchId: branch.id as string
  });
  expect(employee.ok, 'admin creates a branch employee').toBeTruthy();
  createdEmployeeIds.push((employee.body as { id: string }).id);

  // ---------- Book a trip through the form, picking that employee ----------
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
    fieldGroup(dialog, 'Driver').getByRole('combobox')
  );

  // Destination first, then the fields below it: the picker's suggestion
  // popover is dismissed by the next mousedown (destination-picker.tsx's
  // click-away handler), so nothing later is clicked through it.
  const destination = `TG-E2E ${Date.now()}`;
  await dialog.locator('#destination').fill(destination);
  await dialog.locator('#purpose').fill('E2E guides');
  await dialog.getByPlaceholder('Participant 1').fill('E2E Passenger');

  // The guide picker: this branch's unarchived employees, and an ordinary
  // combobox — the e2e suite drives getByRole('combobox')/getByRole('option'),
  // which is why components/ui/multi-select.tsx (bare <div onClick>, no roles)
  // could not be used here (design §9.3).
  await dialog.getByRole('combobox', { name: 'Guide 1' }).click();
  await page
    .getByRole('option', { name: `${guideName} — Tour Guide`, exact: true })
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
  await dialog.locator('input[type="date"]').first().fill(isoDay);
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
    | { id: string; guides: { employee: { name: string } }[] }
    | undefined;
  // Queued for teardown the moment an id exists — before any assertion that
  // could throw and skip it. The browser already booked this ticket (the
  // dialog closed on the success path above); if the API lookup below fails
  // to resolve it, or the guides-content check after that fails, the row is
  // still real and still has to be deleted, exactly as the employee id is
  // captured immediately after creation above.
  if (booked) createdTicketIds.push(booked.id);
  expect(booked, 'the booked ticket resolves via the API').toBeTruthy();
  expect(
    booked!.guides.map((g) => g.employee.name),
    'the guide picked in the form reached the ticket'
  ).toEqual([guideName]);

  // ---------- The ticket detail page renders the guide BY NAME ----------
  // Covers what the API-shape assertion above cannot: guideToSnake actually
  // flattening the join row onto the employee (id/name/position), and
  // TripTicket.guides reaching the Guides DetailItem (Step 13). A regression
  // that mapped `id: g.id` instead of `g.employee.id` would leave the badge
  // rendering the join row's own (non-existent) name — undefined — while
  // every other assertion in this spec, which reads either the form's own
  // state or the raw API payload, would stay green.
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

// The other half of the story the first test doesn't reach: the employee is
// not staged through the API at all here — it is created live on the
// Organization page's Employees tab, the same flow organization.spec.ts's own
// "admin adds a branch employee" test drives, and is picked from the booking
// form's Guides field moments later. This is what proves the two features
// actually connect end to end: useOrgInvalidation's employees branch (or the
// new row never reaches the picker) and the picker's branch lock (or a
// sibling branch's employee leaks into it), stood up together rather than
// each staged around the other.
test('an admin adds a branch employee, books them as a guide, and the ticket names them; a sibling-branch employee is absent from the picker', async ({
  page,
  request
}) => {
  const admin = await apiLogin(request, CREDENTIALS.admin);
  const stamp = Date.now();
  const employeeName = `E2E Added Guide ${stamp}`;
  const northName = `E2E North Guide ${stamp}`;

  // ---------- The negative control, staged through the API ----------
  // An employee of a DIFFERENT branch. Nothing about creating it is under
  // test; what matters is that it never appears in a Main Branch picker.
  const branches = listData(
    await apiGet(request, '/api/branches', admin.token)
  );
  const mainBranch = branches.find((b) => b.name === 'Main Branch');
  const northBranch = branches.find((b) => b.name === 'North Branch');
  expect(mainBranch, 'the seeded Main Branch resolves').toBeTruthy();
  expect(northBranch, 'the seeded North Branch resolves').toBeTruthy();

  const north = await apiPost(request, '/api/employees', admin.token, {
    name: northName,
    branchId: northBranch!.id as string
  });
  expect(north.ok, "the picker's negative control is created").toBeTruthy();
  createdEmployeeIds.push((north.body as { id: string }).id);

  // ---------- 1: add an employee through Organization → Employees ----------
  await login(page, 'admin');
  await page
    .getByRole('link', { name: 'Organization', exact: true })
    .first()
    .click();
  await page.waitForURL(/\/organization/, { timeout: 15_000 });
  await page.getByRole('tab', { name: 'Employees', exact: true }).click();

  await page.getByRole('button', { name: 'Add Employee' }).click();
  const addDialog = page.getByRole('dialog');
  await expect(addDialog.getByText('Create a new employee.')).toBeVisible({
    timeout: 15_000
  });
  await addDialog.locator('#name').fill(employeeName);
  await addDialog.locator('#position').fill('Tour Guide');
  await fieldGroup(addDialog, 'Branch').getByRole('combobox').click();
  await page.getByRole('option', { name: 'Main Branch', exact: true }).click();
  // The dialog's submit shares its accessible name with the tab's own "Add
  // Employee" button; scoping to the dialog is what disambiguates the click.
  await addDialog.getByRole('button', { name: 'Add Employee' }).click();
  await expect(addDialog).toBeHidden({ timeout: 15_000 });

  const employeeRow = page.getByRole('row').filter({ hasText: employeeName });
  await expect(employeeRow).toBeVisible({ timeout: 15_000 });
  await expect(
    employeeRow,
    'the roster row resolves the branch and the position it was given'
  ).toContainText('Main Branch');
  await expect(employeeRow).toContainText('Tour Guide');
  await shot(page, 'trip-guides-3-employee-added');

  // The UI never shows the id, and teardown needs it.
  const employeeId = listData(
    await apiGet(request, '/api/employees?includeArchived=true', admin.token)
  ).find((e) => e.name === employeeName)?.id as string | undefined;
  expect(employeeId, 'the new employee resolves via the API').toBeTruthy();
  createdEmployeeIds.push(employeeId!);

  // ---------- 2: book a trip and pick them as the guide ----------
  const dialog = await openBookingDialog(page);

  await fieldGroup(dialog, 'Branch').getByRole('combobox').click();
  await page.getByRole('option', { name: 'Main Branch', exact: true }).click();
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
    fieldGroup(dialog, 'Driver').getByRole('combobox')
  );

  const destination = `TG-ADD-E2E ${stamp}`;
  await dialog.locator('#destination').fill(destination);
  await dialog.locator('#purpose').fill('E2E added guide');
  await dialog.getByPlaceholder('Participant 1').fill('E2E Passenger');

  // The branch lock, proved with a positive control in the same open
  // listbox: asserting toHaveCount(0) against a popover that never opened
  // would pass for entirely the wrong reason.
  await dialog.getByRole('combobox', { name: 'Guide 1' }).click();
  await expect(
    page.getByRole('option', { name: `${employeeName} — Tour Guide` }),
    "this branch's own newly-added employee is offered"
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByRole('option', { name: northName }),
    "another branch's employee is not"
  ).toHaveCount(0);
  await page
    .getByRole('option', { name: `${employeeName} — Tour Guide` })
    .click();
  await shot(page, 'trip-guides-4-guide-selected');

  await dialog.getByRole('button', { name: 'Continue' }).click();

  // Far-future and distinct from every other spec's window, INCLUDING this
  // file's own first test (+75 days): the same first-vehicle/first-driver
  // pick could otherwise collide on the same day and fail with
  // VEHICLE_DOUBLE_BOOKED — a fixture collision, not a bug.
  const day = new Date(Date.now() + 205 * 86_400_000);
  const isoDay = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(day.getDate()).padStart(2, '0')}`;
  await dialog.locator('input[type="date"]').first().fill(isoDay);
  await dialog.getByRole('button', { name: 'Continue' }).click();

  await expect(detailValue(page, 'Guides')).toContainText(employeeName, {
    timeout: 15_000
  });

  const posted = page.waitForResponse(
    (res) =>
      res.url().endsWith('/api/trip-tickets') &&
      res.request().method() === 'POST'
  );
  await dialog.getByRole('button', { name: 'Submit Request' }).click();
  const confirmDialog = page.getByRole('alertdialog');
  await confirmDialog.getByRole('button', { name: 'Submit Request' }).click();

  const response = await posted;
  expect(
    response.status(),
    'the booking carried a guide and was accepted'
  ).toBe(201);
  const tripId = ((await response.json()) as { id: string }).id;
  // Queued for teardown the moment the id exists — before any assertion below
  // that could throw. The browser already booked this ticket (the POST
  // above succeeded); if a later assertion fails, the row is still real and
  // still has to be torn down.
  createdTicketIds.push(tripId);
  await expect(confirmDialog).toBeHidden({ timeout: 20_000 });
  await expect(dialog).toBeHidden({ timeout: 20_000 });

  // ---------- 3: the ticket names its guide ----------
  await page.goto(`/trip-tickets/${tripId}`);
  await expect(
    detailValue(page, 'Guides'),
    'the ticket detail names the employee guiding it'
  ).toContainText(employeeName, { timeout: 15_000 });
  await shot(page, 'trip-guides-5-ticket-shows-guide');

  // And the join really was written, rather than the page echoing something
  // it still held from the form it was just submitted from.
  const detail = (await apiGet(
    request,
    `/api/trip-tickets/${tripId}`,
    admin.token
  )) as { guides?: { employee: { name: string } }[] };
  expect(
    (detail.guides ?? []).map((g) => g.employee.name),
    'the ticket carries exactly the one guide that was picked'
  ).toEqual([employeeName]);
});
