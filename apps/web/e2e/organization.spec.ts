import { test, expect, type Page, type Locator } from '@playwright/test';
import {
  login,
  shot,
  CREDENTIALS,
  apiLogin,
  apiGet,
  apiPost,
  listData
} from './helpers';

// This is the first and only thing that actually runs the Organization page
// in a browser — Tasks 1-7 shipped on tsc + eslint + a static trace of the
// code, never a click (see task-7-report.md's "Bottom line"). Two of the
// three tests below specifically target the paths the Task 7 reviewer named
// as the riskiest and least proven: a blocked archive rendering its blockers
// inline rather than failing silently, and editing a record whose parent has
// since been archived — a sequence that was actually broken (a blank Select,
// an unsaveable record, "None" as the only working click) until the last fix
// round in that task.

// Branches and offices have no hard-delete route — only POST .../archive and
// .../restore exist (apps/api/src/modules/organization/router.ts) — so
// cleanup archives what this spec created instead of deleting it, per-id,
// the same way multi-date-trip.spec.ts's per-id try/catch teardown survives
// one bad id without stranding the rest. A branch cannot be archived while it
// still owns an active child office (branchBlockers only excludes ARCHIVED
// children — apps/api/src/modules/organization/guard.ts), so offices are
// archived before branches here, regardless of what state each test already
// left its own records in.
const createdBranchIds: string[] = [];
const createdOfficeIds: string[] = [];

test.afterAll(async ({ request }) => {
  const admin = await apiLogin(request, CREDENTIALS.admin);

  for (const id of createdOfficeIds) {
    try {
      const r = await apiPost(
        request,
        `/api/offices/${id}/archive`,
        admin.token,
        {}
      );
      // 409 here just means a test already archived it — not a cleanup failure.
      if (!r.ok && r.status !== 409) {
        console.error(
          `organization cleanup: archiving office ${id} failed (HTTP ${r.status})`
        );
      }
    } catch (err) {
      console.error(`organization cleanup: archiving office ${id} threw:`, err);
    }
  }

  for (const id of createdBranchIds) {
    try {
      const r = await apiPost(
        request,
        `/api/branches/${id}/archive`,
        admin.token,
        {}
      );
      if (!r.ok && r.status !== 409) {
        console.error(
          `organization cleanup: archiving branch ${id} failed (HTTP ${r.status})`
        );
      }
    } catch (err) {
      console.error(`organization cleanup: archiving branch ${id} threw:`, err);
    }
  }
});

// ---------- Local helpers, specific to this spec's UI paths ----------

async function goToOrganization(page: Page): Promise<void> {
  await page
    .getByRole('link', { name: 'Organization', exact: true })
    .first()
    .click();
  await page.waitForURL(/\/organization/, { timeout: 15_000 });
  await expect(
    page.getByRole('heading', { level: 1, name: 'Organization', exact: true })
  ).toBeVisible({ timeout: 15_000 });
}

async function selectTab(
  page: Page,
  name: 'Branches' | 'Offices' | 'Office Heads'
): Promise<void> {
  await page.getByRole('tab', { name, exact: true }).click();
}

// The trip-ticket booking dialog is the one form every role's booking flow
// shares, and it's what "does the new branch show up anywhere real" means in
// practice.
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

// record-dialog.tsx's FieldLabel has no id wired to its Select trigger (a
// known, pre-existing gap noted in progress.md's Task 7 findings), so the
// Branch combobox can't be found through an associated label. Its enclosing
// Field renders role="group", and "Branch" is the one whole word unique to
// that group in every dialog this spec opens (as opposed to "Department/
// Office/College" or "Office Head") — scoping through it is what actually
// pins down the right control instead of the first select on the page.
function branchGroup(dialog: Locator): Locator {
  return dialog.getByRole('group').filter({ hasText: 'Branch' });
}

// Leaves the booking dialog without submitting a trip ticket. A Select
// popover left open over the dialog eats the first Escape (Radix closes the
// popover, not the dialog); the explicit Cancel click then closes the dialog
// itself. Neither control here warns about unsaved changes.
async function closeBookingDialog(page: Page, dialog: Locator): Promise<void> {
  await page.keyboard.press('Escape');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}

test('admin creates a branch, sees it live in the booking form, archives it away, and restores it', async ({
  page,
  request
}) => {
  await login(page, 'admin');
  const branchName = `E2E Branch ${Date.now()}`;

  // ---------- 1: sign in as admin, go to /organization ----------
  await goToOrganization(page);

  // ---------- 2: create a branch with a run-unique name ----------
  // A fixed name would collide with itself on the second run: branch names
  // are now case-insensitively unique in the database (migration
  // 20260826072636_add_org_archive).
  await page.getByRole('button', { name: 'Add Branch' }).click();
  const createDialog = page.getByRole('dialog');
  await expect(createDialog.getByText('Create a new branch.')).toBeVisible({
    timeout: 15_000
  });
  await createDialog.locator('#name').fill(branchName);
  await createDialog.getByRole('button', { name: 'Add Branch' }).click();
  await expect(createDialog).toBeHidden({ timeout: 15_000 });

  const branchRow = page.getByRole('row').filter({ hasText: branchName });
  await expect(branchRow).toBeVisible({ timeout: 15_000 });
  await shot(page, 'organization-1-branch-created');

  // Resolve the id via the API — the UI never shows it, and both cleanup and
  // the assertions below need it.
  const admin = await apiLogin(request, CREDENTIALS.admin);
  const branchesAfterCreate = listData(
    await apiGet(request, '/api/branches?includeArchived=true', admin.token)
  );
  const branchId = branchesAfterCreate.find((b) => b.name === branchName)
    ?.id as string | undefined;
  expect(branchId, 'the created branch resolves via the API').toBeTruthy();
  createdBranchIds.push(branchId!);

  // ---------- 3: the new branch appears in the booking form's dropdown ----------
  let booking = await openBookingDialog(page);
  await branchGroup(booking).getByRole('combobox').click();
  await expect(
    page.getByRole('option', { name: branchName, exact: true })
  ).toBeVisible({ timeout: 15_000 });
  await closeBookingDialog(page, booking);

  // ---------- 4: back to /organization; archive it (empty, so it succeeds) ----------
  await goToOrganization(page);
  await expect(branchRow).toBeVisible({ timeout: 15_000 });
  await branchRow.getByRole('button', { name: 'Archive' }).click();
  const archiveDialog = page.getByRole('alertdialog');
  await expect(archiveDialog).toContainText(`Archive "${branchName}"?`);
  await archiveDialog
    .getByRole('button', { name: 'Archive', exact: true })
    .click();
  await expect(archiveDialog).toBeHidden({ timeout: 15_000 });
  await expect(branchRow.getByText('Archived')).toBeVisible({
    timeout: 15_000
  });
  await shot(page, 'organization-2-branch-archived');

  // ---------- 5: gone from the booking dropdown ----------
  booking = await openBookingDialog(page);
  await branchGroup(booking).getByRole('combobox').click();
  // A positive control in the same listbox proves it actually opened and
  // rendered real branches — asserting toHaveCount(0) against a popover that
  // never opened would pass for the wrong reason.
  await expect(
    page.getByRole('option', { name: 'Main Branch', exact: true })
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByRole('option', { name: branchName, exact: true })
  ).toHaveCount(0);
  await closeBookingDialog(page, booking);

  // ---------- 6: still listed on /organization with an Archived badge; restore it ----------
  await goToOrganization(page);
  await expect(branchRow).toBeVisible({ timeout: 15_000 });
  await expect(branchRow.getByText('Archived')).toBeVisible();
  await branchRow.getByRole('button', { name: 'Restore' }).click();
  await expect(branchRow.getByText('Archived')).toHaveCount(0, {
    timeout: 15_000
  });
  await expect(branchRow.getByRole('button', { name: 'Archive' })).toBeVisible({
    timeout: 15_000
  });
  await shot(page, 'organization-3-branch-restored');
});

test('archiving a branch that is still in use renders its blockers inside the dialog, not a toast', async ({
  page,
  request
}) => {
  await login(page, 'admin');
  await goToOrganization(page);

  // The seeded Main Branch owns vehicles, drivers and offices (see
  // apps/api/prisma/seed.ts) — nothing this spec does moves any of them off
  // it, so it stays a reliable blocked-archive fixture across runs.
  const mainRow = page.getByRole('row').filter({ hasText: 'Main Branch' });
  await expect(mainRow).toBeVisible({ timeout: 15_000 });
  await expect(
    mainRow.getByText('Archived'),
    'Main Branch starts active — seeded, never archived'
  ).toHaveCount(0);

  await mainRow.getByRole('button', { name: 'Archive' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Archive "Main Branch"?');

  await dialog.getByRole('button', { name: 'Archive', exact: true }).click();

  // The dialog stays open and re-renders in its blocked state — it does not
  // close, and archive-dialog.tsx's useArchiveOrgRecord fires no toast on
  // error at all (only its onSuccess does), so nothing is reported through a
  // toast instead.
  await expect(dialog).toContainText('Cannot archive "Main Branch"', {
    timeout: 15_000
  });
  await expect(dialog).toBeVisible();
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);

  // The 409's details.blockers is rendered as "<count> <resource>" lines
  // (BLOCKER_LABELS' plural/singular forms in lib/api/organization.ts).
  const blockerLines = await dialog.locator('li').allTextContents();
  expect(
    blockerLines.length,
    'the blocked dialog lists at least one blocking resource'
  ).toBeGreaterThan(0);
  for (const line of blockerLines) {
    expect(line).toMatch(/^\d+ /);
  }
  expect(
    blockerLines.some((line) => /vehicles?$/.test(line)),
    `expected a vehicles line among: ${blockerLines.join(', ')}`
  ).toBeTruthy();
  await shot(page, 'organization-4-blocked-archive');

  // Only "Close" is offered in the blocked state — the Archive action is
  // gone, not merely disabled.
  await expect(
    dialog.getByRole('button', { name: 'Archive', exact: true })
  ).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });

  // Still active, both on screen and via the API.
  await expect(mainRow.getByText('Archived')).toHaveCount(0);
  const admin = await apiLogin(request, CREDENTIALS.admin);
  const branches = listData(
    await apiGet(request, '/api/branches?includeArchived=true', admin.token)
  );
  const main = branches.find((b) => b.name === 'Main Branch');
  expect(
    main?.archivedAt,
    'Main Branch is still active after the refused archive'
  ).toBeNull();
});

test('editing an office whose branch has since been archived shows the branch as "(archived)" and saves without severing it', async ({
  page,
  request
}) => {
  await login(page, 'admin');
  const branchName = `E2E Parent Branch ${Date.now()}`;
  const officeName = `E2E Office ${Date.now()}`;
  const renamedOfficeName = `${officeName} Renamed`;

  // ---------- Create the branch, then an office under it ----------
  await goToOrganization(page);
  await page.getByRole('button', { name: 'Add Branch' }).click();
  let dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Create a new branch.')).toBeVisible({
    timeout: 15_000
  });
  await dialog.locator('#name').fill(branchName);
  await dialog.getByRole('button', { name: 'Add Branch' }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  const branchRow = page.getByRole('row').filter({ hasText: branchName });
  await expect(branchRow).toBeVisible({ timeout: 15_000 });

  const admin = await apiLogin(request, CREDENTIALS.admin);
  const branches = listData(
    await apiGet(request, '/api/branches?includeArchived=true', admin.token)
  );
  const branchId = branches.find((b) => b.name === branchName)?.id as
    | string
    | undefined;
  expect(branchId, 'the parent branch resolves via the API').toBeTruthy();
  createdBranchIds.push(branchId!);

  await selectTab(page, 'Offices');
  await page.getByRole('button', { name: 'Add Office' }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Create a new office.')).toBeVisible({
    timeout: 15_000
  });
  await dialog.locator('#name').fill(officeName);
  await branchGroup(dialog).getByRole('combobox').click();
  await page.getByRole('option', { name: branchName, exact: true }).click();
  await dialog.getByRole('button', { name: 'Add Office' }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });

  let officeRow = page.getByRole('row').filter({ hasText: officeName });
  await expect(officeRow).toBeVisible({ timeout: 15_000 });

  const offices = listData(
    await apiGet(request, '/api/offices?includeArchived=true', admin.token)
  );
  const officeId = offices.find((o) => o.name === officeName)?.id as
    | string
    | undefined;
  expect(officeId, 'the created office resolves via the API').toBeTruthy();
  createdOfficeIds.push(officeId!);

  // ---------- Archive the office, then its now-childless branch ----------
  // This is the brief's own documented workflow for producing an archived
  // record with an archived parent — the exact combination that was
  // unsaveable before the Task 7 fix round.
  await officeRow.getByRole('button', { name: 'Archive' }).click();
  let archiveDialog = page.getByRole('alertdialog');
  await archiveDialog
    .getByRole('button', { name: 'Archive', exact: true })
    .click();
  await expect(archiveDialog).toBeHidden({ timeout: 15_000 });
  await expect(officeRow.getByText('Archived')).toBeVisible({
    timeout: 15_000
  });

  await selectTab(page, 'Branches');
  await expect(branchRow).toBeVisible({ timeout: 15_000 });
  await branchRow.getByRole('button', { name: 'Archive' }).click();
  archiveDialog = page.getByRole('alertdialog');
  await archiveDialog
    .getByRole('button', { name: 'Archive', exact: true })
    .click();
  // A childless branch archives cleanly — this must NOT land in the blocked
  // state. If it did, either the office archive above didn't really take, or
  // branchBlockers is (wrongly) still counting an archived child.
  await expect(archiveDialog).toBeHidden({ timeout: 15_000 });
  await expect(branchRow.getByText('Archived')).toBeVisible({
    timeout: 15_000
  });

  // ---------- Edit the archived office: its archived branch must show, not blank ----------
  await selectTab(page, 'Offices');
  officeRow = page.getByRole('row').filter({ hasText: officeName });
  await expect(officeRow).toBeVisible({ timeout: 15_000 });
  await officeRow.getByRole('button', { name: 'Edit' }).click();

  dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Update this office.')).toBeVisible({
    timeout: 15_000
  });
  const branchCombobox = branchGroup(dialog).getByRole('combobox');
  // The trap this proves closed: before the fix, an archived parent missing
  // from the (active-only) options list rendered as a completely blank
  // trigger — not even the placeholder — so this checks real visible text,
  // not just "the control exists".
  await expect(branchCombobox).toContainText(branchName, { timeout: 15_000 });
  await expect(branchCombobox).toContainText('(archived)');
  await shot(page, 'organization-5-edit-archived-parent');

  // ---------- Change ONLY the name, leave the branch untouched, save ----------
  await dialog.locator('#name').fill(renamedOfficeName);
  await dialog.getByRole('button', { name: 'Save Changes' }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });

  const renamedRow = page
    .getByRole('row')
    .filter({ hasText: renamedOfficeName });
  await expect(renamedRow).toBeVisible({ timeout: 15_000 });
  await expect(renamedRow.getByText('Archived')).toBeVisible();
  // The Branch column still resolves the archived branch's name — the
  // relationship was never severed by the save.
  await expect(renamedRow).toContainText(branchName);

  // ---------- The office's branchId genuinely did not change ----------
  const officesAfter = listData(
    await apiGet(request, '/api/offices?includeArchived=true', admin.token)
  );
  const officeAfter = officesAfter.find((o) => o.id === officeId);
  expect(officeAfter?.name).toBe(renamedOfficeName);
  expect(
    officeAfter?.branchId,
    "the office's branch is unchanged by the rename"
  ).toBe(branchId);
});
