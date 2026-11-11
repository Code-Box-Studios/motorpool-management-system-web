# Driver and guard history implementation plan

**Goal:** Give drivers completed and cancelled outing history, give guards their confirmed scan history, and tidy driver card actions.

**Approach:** Reuse persisted trip dates and actor/time stamps. Driver history is scoped to the assigned driver and lists each outing independently, including completed dates on tickets with future outings. Guard history includes departure and return confirmations by the signed-in actor across branches. Merely opening the camera or matching a QR is not a recorded gate confirmation.

**Interface:** Add History tabs beside current work, with search, status/action filters, pagination, vehicle/schedule details, mileage or scan time, cancellation reasons, and links to ticket details. Keep QR and mileage dialogs available on active assignments. Compact mileage buttons sit beside readings; secondary card actions share a restrained footer with 44px touch targets.

**Constraints:** Work directly on main. Preserve unrelated artifacts. Use existing theme tokens and controls. No database migration or new dependencies. Keep existing gate locking and captured-outing behavior. Do not deploy until requested.

- [x] Add failing API coverage for an actor-bound `scannedByMe` list filter, including legacy stamps, missing confirmations, and other actors.
- [x] Add failing browser coverage for per-outing driver history, cancelled assignments, guard-specific confirmations, search/filter/paging, and compact responsive actions.
- [x] Implement the filter, history builders/list UI, tabs, and driver action layout.
- [x] Run targeted API and browser regressions, build, typecheck, lint, and formatting. Inspect both themes on desktop and phones.

## Verification

- `pnpm test`: 897 passed (739 API, 101 shared, 53 gateway, 4 packaging).
- Targeted Playwright: 15 passed, including history filtering, role-change detail links, QR decoding, captured outing targets, and odometer dialog recovery.
- Typecheck, lint, and web production build passed.
- Desktop and phone captures inspected in light and dark themes. Read-only review found no remaining issues.
- Existing local records verified through authenticated API and the driver history page. No production data was changed.
