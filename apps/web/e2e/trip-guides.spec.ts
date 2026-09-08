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
