# Maintenance Controls and Vehicle Details

**Goal:** Put model controls first, make maintenance lists searchable, and give vehicle details a compact, readable layout.

**Design:** The Predictive tab starts with one model-control card. Vehicle risk uses Random Forest (default) or the existing usage-based estimate; parts recommendations use FP-Growth (default) or Eclat. Run Model applies the draft selections and refreshes both outputs. Vehicle risk scores and priority badges follow the selected risk method. The supplied association rules cannot produce vehicle failure scores, and the client decision tree remains an informational cross-check.

Preventive vehicles, predictive vehicles, and parts recommendations each get search inside their card, beside existing filters. Searches are independent, case-insensitive, combine with filters, persist across tab changes, and clear without discarding filters. Dashboard previews remain unaffected.

Vehicle details gets a compact identity header with a full-height photo frame, grouped specifications and registration information, and preserved edit/delete actions, role guards, gallery, tracker, and maintenance sections. Per the user's follow-up, cars without photos keep the same image frame and show the UM logo; real images crop to fill the frame.

## Implementation

- [x] Pin selectable risk methods and invalid algorithms with failing API tests.
- [x] Add optional risk-method query support without changing default callers or the client cross-check.
- [x] Add failing browser coverage for top controls, real risk-score changes, scoped search, filter combinations, loading/error recovery, and narrow layouts.
- [x] Extract top model controls and keep parts result rendering below the vehicle cards.
- [x] Add independent search to Preventive, Predictive, and parts cards using the existing themed search/filter toolbar.
- [x] Redesign vehicle details independently and preserve all data and permissions.
- [x] Run workspace tests/build/type checks/lint and focused browser checks after edits settle.
- [x] Review the final diff, address material findings, and leave the app running at port 5174.

## Verification

- Workspace tests: 595 passed (557 API, 10 shared, 28 GPS gateway).
- Browser checks: 27 passed across maintenance models/search, floating filters, and vehicle details/gallery/layout.
- Workspace build and type checks passed; the final web build and lint passed after the last source edits.
- Review findings fixed with regression coverage: scoped searches preserve the Schedule page and sort; gallery navigation skips failed images and keeps the current valid image open.
- Desktop and mobile screenshots reviewed. The web app remains available at `http://localhost:5174` with the API at port 3001.

## Boundaries

- Work directly on main; no branches or worktrees.
- Do not present Eclat/FP-Growth confidence as vehicle risk.
- Keep the experimental client decision tree out of production risk scoring.
- Keep usage-based scoring clearly labelled as an estimate.
- Preserve the live association endpoint and saved model source files.
- Scoped searches preserve the Schedule page, sort, other selections, and scroll position.
- Vehicle names remain visibly underlined links with navigation arrows in preventive and predictive cards.
