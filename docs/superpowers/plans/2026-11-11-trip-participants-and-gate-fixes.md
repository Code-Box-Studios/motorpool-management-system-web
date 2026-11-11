# Trip participants and gate correctness

## Requested behavior

- Participants precede guides in trip creation.
- Participant type is Students or Employees; Students remains the default for compatibility.
- Students use the current free-text name list and require at least one employee guide.
- Employees use the current employee roster multi-select; their guides are optional.
- The API enforces these rules, and pending-ticket editing and detail views preserve the selected type and roster identities.
- Fix the four audited defects: whole-ticket cancellation racing departure, outing cancellation racing departure, EVP approval racing cancellation, and stale gate confirmations acting on another outing.

## Implementation choices

- Persist `participantType` (`students` / `employees`) and employee membership in a separate `TripTicketParticipant` relation (`participantEmployees`). Retain `participants` as the historical name snapshot.
- Accept `participantEmployeeIds` on create/PATCH. New employee selections must be distinct, existing, unarchived roster records. Unrelated edits preserve historical assignments and names.
- Keep the printed QR as the ticket UUID. Gate requests additionally require `dateId`, captured when the guard opens the dialog; reject stale or mismatched outings.
- Serialize all ticket status changes with a ticket row lock before driver and vehicle locks. Revalidate status inside each transaction.
- Work directly on main. Preserve unrelated files and existing data. Deployment and the release commit/push were subsequently authorized by the user.

## Tasks and verification

- [x] Add failing regression tests for the four audited failures and stale checkout/return requests.
- [x] Fix gate/approval/cancellation transactions and bind browser confirmations to their selected outing.
- [x] Add contract and API tests for participant type, roster selection, student guide requirement, employee optional guides, edits, historical records, and capacity.
- [x] Add an additive PostgreSQL migration, Prisma relation, and participant normalization; keep all existing trip records readable as Students.
- [x] Implement creation/edit/detail participant controls and conditional guides using the existing picker.
- [x] Verify student and employee browser flows, switching types, roster selection, empty optional guides, mobile layout, both themes, and QR behavior.
- [x] Run shared/API suites, TypeScript/build/lint checks, and a final review. Report any failures and remaining limits.

## Ownership

- Gate worker: trip transition implementation, gate contract fields, guard API/mutations/UI, gate-related tests.
- Participant UI worker: creation/edit/detail forms, picker labels, web participant types/API mapping, participant browser tests.
- Main worker: participant contracts, database migration/schema, participant backend helpers/service/repository, integration tests, final integration and review.

## Interface agreement

- Wire input: `participantType?: 'students' | 'employees'`, `participantEmployeeIds?: string[]`, `guideIds: string[]`.
- API response: `participantType`, existing `participants: string[]`, and `participantEmployees: { employeeId: string; employee: { id: string; name: string; position: string | null; archivedAt: Date | null } }[]`.
- Web model: `participant_type`, `participant_employee_ids`, `participant_employees`; student names remain `participants`.
- Gate input: `{ dateId: string }` for check-out and check-in. A missing or stale date ID must not change any outing or vehicle state.

## Verification results

- `pnpm test`: 896 passed (738 API, 101 shared, 53 gateway, four packaging).
- Combined browser regression command: 16 passed. Five existing guide/list browser checks also passed.
- Real browser employee and student draft submissions returned 201; both test drafts were deleted (204).
- `pnpm build`, `pnpm typecheck`, `pnpm lint`, and scoped formatting checks passed.
- Independent review findings were fixed and re-reviewed with no remaining blockers.
- Local schema migrated without resetting existing data. Production and physical phone cameras were not tested.

## Release authorization

The user requested deployment after implementation verification. Deploy the scoped changes on main to the existing Render API and Vercel production project; apply the additive migration through the established API deployment startup and verify provider status and live behavior.
