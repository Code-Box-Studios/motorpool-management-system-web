# Live GPS Cleanup Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this cleanup on the existing `main` checkout.

**Goal:** Remove in-app GPS simulation and fabricated telemetry, and remove identifiable legacy simulated history while preserving real tracker readings.

**Architecture:** Keep the hardware gateway, authenticated ingest API, tracker registry, and polling reads. Delete the dashboard writer and synthetic seed block. Show missing telemetry honestly and center maps on received coordinates. Use a dry-run cleanup script with exact historical fingerprints, an explicit cutoff, and a private backup before deleting stored points.

**Tech Stack:** React, TanStack Query, Leaflet, Express, Prisma/Postgres, Playwright, Node test runner.

**Spec:** User requested removal of GPS test/demo information and explicitly included old simulated history. The ST-901L-X gateway fix is already working and must be preserved.

## Global Constraints

- Work on `main`; preserve the existing gateway decoder changes. No commit, push, or deployment unless requested.
- Remove production demo GPS writers and public browser device-key configuration; retain automated regression tests and standalone development tools.
- Delete only historical rows matching the old seed or browser route fingerprint before the explicit cutoff. Back up selected rows before applying deletion.
- Do not reset/reseed databases or remove real devices, vehicle records, or live readings.

## Review Focus

- Null speed must not display as a stopped vehicle; zero heading must display as north.
- A map with no valid coordinates must show its empty state, with no fabricated location.
- Removing the browser writer must not affect hardware ingest or GPS reads.
- History cleanup must preserve nonmatching points and every point at/after the cutoff.
- Removing GPS rows must not leave fabricated cached vehicle coordinates.

## Task 1: Remove simulation, clean history, and verify live-only behavior

- [x] Add browser regressions for no demo controls/ingest, missing telemetry, zero heading, and the no-data map; observe relevant failures.
- [x] Delete dashboard simulation and its browser API/mutation/key setting; remove synthetic GPS seed generation and update current documentation.
- [x] Center maps on real coordinates and distinguish missing speed, engine state, and heading from measured zero values.
- [x] Add and test a dry-run-first historical cleanup script with a cutoff, exact fingerprints, and backup; inspect and clean the local database.
- [ ] Inspect the deployed database using available authorized access; clean only proven simulated rows. Record any unavailable access honestly.
- [x] Verify focused browser tests, desktop/mobile layout, web build/lint, API typecheck, gateway tests/build, and `git diff --check`.
- [x] Request a focused review, address material findings, and report code/data/deployment status separately.

## Execution Evidence

- Four browser regressions failed against the original UI, then passed after cleanup. Seven focused browser tests pass, including tracker registration and role access.
- Seven cleanup classifier tests and all 36 gateway tests pass. Web build/lint, API typecheck, gateway build, and `git diff --check` pass. Production browser assets contain no removed demo controls or browser device-key references.
- Desktop/mobile browser checks show no page errors; the 390px mobile document remains 390px wide. Local GPS empty states contain no fabricated map markers.
- Local database: 50 exact seed matches backed up privately with permissions `0600`, then deleted. User/vehicle counts remain 9/8; GPS history is empty.
- Production read-only API inspection: 1,722 exact matches before 2026-11-06T05:36:19Z across the current fleet, no unmatched older points in those vehicle histories. A private snapshot was saved. No production rows have been deleted.
- Production database mutation awaits Render access. A Render integration was offered but is not confirmed installed/connected.
- Independent review found no actionable correctness issues. These checks were recorded before publication; the user subsequently requested committing and pushing the verified changes directly to `main`. Production history deletion remains separate and pending Render access.
