# Design Brief — Motorpool Management System (MMS)

**A redesign brief for a working internal web app.** Everything below is self-contained: you do not need access to the codebase to work from it.

> **How to use this:** paste this document into a new Claude conversation and **attach the 17 screenshots** from `apps/web/e2e/screenshots/` (regenerate them any time with `pnpm --filter @mms/web test:e2e` while the app is running). The screenshots are the source of truth for how it looks today; this document explains what it *does* and why.

---

## 1. What the product is

MMS runs a shared pool of company vehicles for an organisation in the Philippines (Davao region). It's an **internal operations tool**, not a consumer product. It handles the full life of a vehicle request:

> Someone needs a vehicle → an admin approves it and sets a fuel budget → a senior officer signs off on the fuel → a security guard releases the vehicle at the gate → the driver goes → the guard checks it back in.

Plus the workshop side (repairs, preventive maintenance, spare parts, tools), live GPS tracking of the fleet on a map, and predictive-maintenance insights.

It is used **daily, by non-technical staff**, often under time pressure (a guard at a gate with a vehicle waiting).

---

## 2. The five users — and their real context

This is the single most important input to the redesign. The roles are **wildly different**, and the current design largely ignores that.

| Role | Their job | Where they physically are | How often |
| --- | --- | --- | --- |
| **Admin** | The hub. Approves trips, sets fuel budgets, assigns mechanics, completes repairs, manages vehicles/drivers/users/parts/tools/trackers. | At a desk, big screen, long sessions | All day |
| **Requester** | Asks for a vehicle. Tracks their own request. | At a desk | Occasionally |
| **EVP Operations** | Approves the **fuel budget** on trips and gives final sign-off on **repairs**. That's it — a pure approval queue. | Desk or phone, short bursts | A few times a day |
| **Security Guard** | Releases the vehicle at the gate (check-out) and receives it back (check-in). Scans a QR to verify. | **Standing at a gate**, likely on a phone/tablet, vehicle idling in front of them | Many times a day |
| **Driver** | Sees the trips assigned to them. | **In or beside a vehicle**, on a phone | Daily |

**Three of these five people are not at a desk.** The current UI is a desktop admin console for all of them.

---

## 3. The screens (and which screenshot is which)

The app has a **role-aware home screen**: `/dashboard` renders five completely different things depending on who logs in.

| Screenshot | Screen | Who sees it |
| --- | --- | --- |
| `admin-dashboard.png` | Fleet dashboard: 4 metric tiles, Preventive + Predictive Maintenance panels, a large live GPS map | Admin, Requester |
| `requester-dashboard.png` | Same fleet dashboard | Requester |
| `evp-approvals.png` | Two stacked approval tables (Trip Ticket Approval, Job Order Approval) | EVP Operations |
| `guard-confirmation.png` | Gate screen: trip cards with Check Out / Check In + a QR verification step | Security Guard |
| `driver-trips.png` | "My Trip Tickets" — only their assigned trips | Driver |
| `admin-nav-trip-tickets.png` | Trip Tickets — **defaults to a Calendar view**, with a Table behind a toggle | Admin, Requester |
| `admin-nav-job-orders.png` | Job Orders (repair workflow) | Admin, Driver |
| `admin-nav-vehicles.png` | Vehicles (fleet CRUD, photos, status) | Admin |
| `admin-nav-drivers.png` | Drivers (personnel + licences) | Admin |
| `admin-nav-maintenance.png` | Maintenance (service history, standards, per-vehicle tracking) | Admin |
| `admin-nav-spare-parts.png` | Spare parts inventory | Admin |
| `admin-nav-tools.png` | Tools (borrow / return) | Admin, Driver |
| `admin-nav-user-management.png` | User management | Admin |
| `trackers-1-registered.png` | GPS Trackers registry (register a tracker by IMEI, assign to a vehicle, online/offline) | Admin |
| `lifecycle-1/2/3-*.png` | The trip approval flow in motion (EVP pending → approved → completed in the admin table) | — |

**Navigation:** a left sidebar, grouped into **Management / Assets / Settings**. It is generated from route metadata and filtered by role.

---

## 4. Current design system & visual language

Work **within** this unless you have a strong reason to argue otherwise (and if you do — say so explicitly, and say what it costs).

- **Stack:** React 19 + Vite, **Tailwind CSS**, **shadcn/ui** components (Card, Table, Dialog/AlertDialog, Select, Badge, Button, Field, Sidebar, Skeleton, Sonner toasts), Leaflet for the map, FullCalendar for the trip calendar.
- **Palette (as observed):** warm off-white/cream page background; a strong **maroon / deep crimson** as the primary (logo, primary buttons, badges); **amber** as a secondary accent (in-progress states); near-black text; soft rounded cards with subtle borders.
- **Shape language:** large rounded corners, pill-shaped buttons and badges, generous card padding.
- **Density:** low. Lots of white space, and a lot of *dead* space (see below).
- **Status is everywhere.** Almost every row/card carries a status badge. The colour system for statuses is a core part of the product's visual identity.
- **Dark mode:** a theme toggle exists in the header.

---

## 5. Concrete problems worth fixing

These are real, observed in the current build — not hypotheticals. A good redesign should have an answer for each.

**Information architecture**
1. **"Dashboard" means five different things.** Guard, driver, EVP, admin and requester all land on `/dashboard` and see entirely different screens. The concept is overloaded, and the breadcrumb says "Dashboard" no matter what you're actually looking at.
2. **The sidebar is dead weight for 2 of 5 roles.** The **Security Guard's sidebar is completely empty** — ~250px of nothing (see `guard-confirmation.png`). The **EVP's sidebar contains a single item ("Dashboard")**. Both roles are paying full desktop-chrome cost for a single-purpose screen.

**The non-desk roles are underserved**
3. The **guard's screen is the whole job** — one card, at a gate, with a vehicle waiting — but it's laid out as a desktop card grid with a huge empty page below. It should probably be the most mobile-optimised, highest-contrast, biggest-tap-target screen in the product. It isn't.
4. The **driver** is on a phone, and gets a desktop table.

**Raw data leaking into the UI**
5. **Raw UUIDs are shown to end users.** The guard screen prints `Trip Ticket ID: 6a411384-20f1-4eaa-beae-18e090892c85`. The EVP's Job Order table shows **`c64ebd27-020d-4cba-b885-6f45f7f43242` in the "Assigned Mechanic" column — where a person's name should be** (see `evp-approvals.png`). Users need human-readable identifiers (a short reference code, a name), not database keys.

**Layout breakage**
6. **Content is clipped.** On the EVP screen the **"Approve" button is cut off at the right edge** of the Job Order table — the table overflows its container. Tables need a real responsive strategy (horizontal scroll container, column priority, or a card layout on narrow screens).
7. **Large dead vertical space** on the guard/EVP screens — content sits in a small band at the top with the rest empty.

**Status system**
8. Status labels are long and unwieldy — e.g. **"Pending Fuel Allocation Approval"** rendered as a full-width pill. There are ~7 trip statuses, 4 job-order statuses, 5 vehicle statuses, plus tool/driver/tracker statuses. They currently share badge styling inconsistently. This deserves a **designed status system**: a consistent semantic colour scale, shorter labels, and a clear visual distinction between "waiting on someone", "in motion", "done", and "stopped/failed".

**Density & focus**
9. The **admin dashboard** competes with itself: 4 metric tiles + a Preventive Maintenance panel + a Predictive Maintenance panel + a very large map, all at once. What is the admin's actual first question when they open this?
10. **Trip Tickets defaults to a Calendar** view, with the table (arguably the more useful operational view) hidden behind a toggle.

---

## 6. What must NOT change

The redesign is free to reshape everything visual, but the **product logic is load-bearing** and enforced by the backend:

- **The trip-ticket flow:** `Pending Admin Approval → Pending Fuel Allocation Approval → Approved → In Progress → Completed`, plus off-ramps `Disapproved` / `Cancelled` (both require a reason). Each transition belongs to a specific role and cannot be skipped.
- **The job-order (repair) flow:** `Pending → Assigned Mechanic → Ongoing Repair → Repaired`.
- **Role permissions.** Who can see and do what is enforced server-side; the UI must not imply an action a role can't perform.
- **The status vocabularies** (names may be re-labelled for display, but the underlying states are fixed).
- **The five roles** and the handoffs between them.

---

## 7. What I'd like from the redesign

In priority order — but push back if you disagree:

1. **A role-first information architecture.** Stop treating five different jobs as one "dashboard". What *is* the right shell for a guard at a gate vs. an admin at a desk?
2. **Make the guard and driver experiences genuinely mobile.** These are the two people who are never at a computer.
3. **A designed status system** — semantic, consistent, scannable at a glance, and short enough to fit.
4. **Fix the leaks:** no raw UUIDs, no clipped buttons, no "Dashboard" breadcrumb on a non-dashboard screen.
5. **A point of view on the admin dashboard** — what's the one thing it should answer first?
6. **Keep it fast to scan.** This is an operations tool used under time pressure, not a marketing site. Clarity and density beat decoration.

**Deliverables I'd find most useful:** an aesthetic direction (type, colour, spacing, shape), the redesigned key screens (guard, EVP approvals, admin dashboard, a table view, a form), the status system, and a mobile treatment for guard + driver.

---

## 8. Practical notes

- **Regenerate the screenshots:** with the app running (`pnpm dev`), run `pnpm --filter @mms/web test:e2e`. They land in `apps/web/e2e/screenshots/`.
- **Try it yourself:** the app seeds demo accounts, all with the password `Password123!` — `admin@mms.local`, `requester@mms.local`, `evp_operations@mms.local`, `security_guard@mms.local`, `driver@mms.local`. Logging in as each role is the fastest way to feel the problem.
- **Ignore in the screenshots:** the map markers sit in *Manila* while the map centres on *Davao* — that's stale demo seed data, not a design decision. Also the "Start Demo" button on the map is a dev affordance.
