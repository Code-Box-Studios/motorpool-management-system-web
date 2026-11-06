# Dashboard Fleet Map Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the dashboard tracking panel answer which tracked vehicles are reporting, moving, stopped, or need attention, and let an operator locate a vehicle immediately.

**Architecture:** A dashboard-only fleet tracking component joins existing GPS, tracker, and vehicle reads. Reuse Leaflet and improve its viewport control without changing backend data or creating telemetry.

**Tech Stack:** React, TanStack Query/Router, existing Tailwind tokens, React Leaflet, Playwright.

**Design:** The user delegated the design with “you decide.” Use a compact fleet summary, selectable vehicle list, map, and selected vehicle telemetry. Keep the full GPS page as the detailed workspace.

## Global Constraints

- Work on main; preserve existing configuration and data.
- Real reads only. No generated GPS, route simulation, inferred engine state, or vehicle-record odometer presented as GPS.
- Connectivity comes from tracker lastSeenAt using the existing five-minute threshold; GPS freshness is shown separately.
- Polling must not snap the map away from an operator's chosen view. Fit fleet and Locate deliberately change the viewport.
- Retain role access behavior, touch scrolling, attribution, zero-valued telemetry, and unknown telemetry.

## Review Focus

- A heartbeat without a fresh position must not make an old position appear current.
- Failed requests must not claim that the fleet is empty or offline.
- Assigned trackers with no fix remain visible and cannot focus a missing marker.
- Loading GPS must not block unrelated dashboard sections.
- Small viewports must scroll naturally without page overflow.

### Task 1: Fleet overview and deliberate map navigation

**Files:** Create dashboard/fleet-tracking.tsx and e2e/dashboard-tracking.spec.ts; modify dashboard/index.tsx and shared/vehicle-map/index.tsx; add a focused dashboard tracking query module if needed.

**Interfaces:** Consume existing GPS rows, TrackerDevice, and VehicleWithBranch. VehicleMap gains optional dashboard presentation and focus/fit request props, with defaults preserving GPS page behavior.

- [x] Write browser tests for fresh/old/missing points, selection, fitting, errors, and mobile behavior.
- [x] Run new tests and observe missing dashboard functionality fail.
- [x] Add the overview, complete paginated tracker reads, independent loading/error states, and map navigation.
- [x] Run focused dashboard/GPS and role checks, web build and lint; inspect desktop/mobile screenshots.
- [x] Review the scoped diff and resolve material findings. Keep changes local unless a new push is requested.

## Verification record

- Playwright: 20 checks passed (11 dashboard tracking, 4 existing live GPS, 5 role landing checks). Browser fixtures only; no GPS history was written.
- Web build and ESLint passed. Build retains the existing large-chunk advisory.
- Desktop and 390px mobile screenshots were checked in light and dark themes using read-only production tracker/GPS responses. One real tracker was shown; no page errors or horizontal overflow.
- The independent read-only review identified unstable tracker pagination plus inaccurate initial loading and failed-read labels. The pagination and pending-GPS regressions failed before their fixes and passed after them. Pagination now uses unique IMEI ascending, and unknown/error states retain their meaning during retries.
- Failed GPS reads retain their error display during automatic retries. They never establish that a tracker has no fix.
- The full GPS workspace keeps wheel zoom; the embedded dashboard map allows ordinary page scrolling. Both preserve the chosen viewport across polling.
- Local web runs at http://localhost:5174 because another project owns port 5173. The existing API on port 3001 was reused.
- At implementation handoff, the verified redesign was local on main. Publishing was subsequently authorized by the user.

## Follow-up: clarify full-map status meanings

The user showed the deployed GPS Map mixing an Active registration, Offline connection, Ready vehicle status, and an old Engine OFF reading. These are independent values, but generic labels and an availability-colored marker made them look contradictory.

- Full-map popups now separate Tracker connection, Booking availability, and Reported ignition. Available vehicles say “Available for booking.”
- Old positions are muted and explicitly labeled “Last known position”; old speed/ignition/heading values say “Last reported.” The recorded timestamp remains visible. Historical speed badges are hidden.
- The tracker list labels Registration and Last contact. A 15-second refresh keeps connection state current without recentering the map. Failed reads remain Unknown.
- The complete registry is read without pagination, with stable IMEI ordering, so markers outside the original 100-row page receive connection state.
- Forbidden registry reads do not repeat on the refresh timer. Existing role permissions were preserved.
- Four initial regressions failed before implementation and then passed. The independent review's registry boundary and its forbidden-polling boundary also failed before their fixes.
- Initial verification: 19 passing GPS/dashboard browser checks, plus web build and lint. The final 10-case GPS verification includes the two review fixes. Real read-only production responses were used for desktop/mobile inspection, with no page errors or horizontal overflow.
- This follow-up is included with the dashboard and Docs changes in the authorized release.
