# Admin GPS Documentation Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Put a clear, searchable GPS setup and operating guide inside MMS, available to all Admin accounts.

**Architecture:** An authenticated Admin-only API returns structured guide content. The web Docs route uses the existing role guard and sidebar policies, then renders short chapters with search, checklists, and copyable commands. Long technician instructions stay in their own chapter. No new role or database changes are needed.

**Design:** The user chose “All Admin accounts” after learning MMS has no separate Superadmin role. Use the existing app design, a desktop chapter rail, mobile chapter picker, plain language, expected results, and expandable troubleshooting answers. Preserve the original technical details and clarify that closing Cloud Shell is safe.

## Global Constraints

- Stay on main and preserve the pending dashboard redesign.
- Restrict content retrieval as well as navigation. Anonymous callers receive 401; every non-Admin role receives 403.
- Do not embed the guide content in the publicly downloadable browser bundle.
- No new permissions, accounts, dependencies, migrations, tracker writes, or deployment changes.
- Keep gateway addresses date-stamped and preserve exact SMS and shell commands.

## Review Focus

- Direct URLs and API requests cannot bypass the Admin restriction.
- Loading or API errors do not look like an empty guide.
- Search finds words inside instructions and commands; clearing it restores navigation.
- Phone controls fit the viewport and keyboard users can navigate chapters.
- Copy failures give a usable manual-copy instruction.

### Task 1: Protected guide content

**Files:** shared/contracts/documentation.ts; api/modules/documentation/{guide,router,documentation.test}.ts; shared/index.ts; api/app.ts.

- [x] Write access tests and observe the missing endpoint fail.
- [x] Add the shared block contract, plain-language guide, and Admin-protected endpoint with private no-store caching.
- [x] Run access tests, API typecheck, and build.

### Task 2: Searchable documentation page

**Files:** web/routes/_authenticated/docs.tsx; web/components/pages/docs/{index,guide-block}.tsx; web/lib/api/documentation.ts; web/components/app-sidebar/index.tsx; web/e2e/docs.spec.ts.

- [x] Write browser tests for Admin navigation, chapters, search, copy, failures, non-Admin direct access, and mobile layout.
- [x] Observe missing page behavior fail, then add the page and navigation.
- [x] Run focused API/browser regressions, web build/lint, inspect desktop/mobile, and complete read-only review.
- [x] Reorganize the existing Notion note using the same reader-friendly chapter structure.

## Progress

- All 7 new endpoint tests failed with 404 before implementation, then passed with the expected 401/403/200 behavior.
- Focused API regression run: 26 passing checks across documentation, app routing/CORS, authentication, and role middleware.
- Combined browser regression run: 28 passing checks, including 8 Docs checks, 11 pending dashboard tracking checks, 4 existing live GPS checks, and 5 role landing screens. No GPS history was generated.
- Web build/lint and API typecheck/build passed. The web build retains the existing chunk-size advisory.
- Desktop and 390px mobile rendering were inspected in the actual local app: no page errors or horizontal overflow. Hash/back navigation and real clipboard copying were exercised. Clipboard failure and unavailable guide responses have recovery instructions.
- Independent review found no Critical or Important issues. Its minor filtered-chapter numbering issue was corrected to retain the original chapter numbers.
- The built browser assets were checked for the gateway IP, reported device ID, and cleanup-table identifiers; none were present.
- The existing Notion page was updated in place with a native table of contents, seven chapters, setup checklists, expandable SMS instructions and troubleshooting, and a separate technician section. No duplicate page was created.
- Existing dashboard work and environment files were preserved on main. Docs was verified at http://localhost:5174/docs. At implementation handoff, publishing was pending; deployment was subsequently authorized by the user.
