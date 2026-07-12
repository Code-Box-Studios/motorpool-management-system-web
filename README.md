# Motorpool Management System

**How the system works — a complete, non-technical guide to what the system does and how each person uses it.** No code, no setup — just what happens on screen and why. (For local setup, the API reference, and environment variables, see the [Developer guide](docs/DEVELOPER_GUIDE.md).)

---

## Table of contents

1. [What the system is for](#1-what-the-system-is-for)
2. [The five roles](#2-the-five-roles)
3. [Signing in and your session](#3-signing-in-and-your-session)
4. [What you see after you log in](#4-what-you-see-after-you-log-in)
5. [The building blocks (the records the system keeps)](#5-the-building-blocks)
6. [Trip Tickets — the heart of the system](#6-trip-tickets--the-heart-of-the-system)
7. [Job Orders — getting a vehicle repaired](#7-job-orders--getting-a-vehicle-repaired)
8. [Vehicles and the fleet](#8-vehicles-and-the-fleet)
9. [Drivers](#9-drivers)
10. [Maintenance (three layers)](#10-maintenance-three-layers)
11. [Inventory — spare parts and tools](#11-inventory--spare-parts-and-tools)
12. [Live GPS tracking and the map](#12-live-gps-tracking-and-the-map)
13. [Analytics and smart insights](#13-analytics-and-smart-insights)
14. [User management](#14-user-management)
15. [Who can do what — permissions at a glance](#15-who-can-do-what--permissions-at-a-glance)
16. [Status glossary](#16-status-glossary)
17. [Rules the system always enforces](#17-rules-the-system-always-enforces)
18. [Role playbooks — a day in the life](#18-role-playbooks--a-day-in-the-life)
19. [For developers](#19-for-developers)

---

## 1. What the system is for

The Motorpool Management System (MMS) runs a shared pool of company vehicles from request to return. It keeps track of:

- **The fleet** — every vehicle, its condition, and where it is right now.
- **The people** — drivers, the staff who request trips, and the officers who approve them.
- **Trips** — who asked for a vehicle, where it's going, who's driving, and the fuel budget for the trip.
- **The workshop** — repairs, preventive maintenance, spare parts, and borrowed tools.
- **Live location** — real-time GPS tracking of vehicles on a map.
- **Insight** — dashboards, maintenance risk predictions, and patterns in parts usage.

Think of it as the single place where a trip request becomes an approved, fuelled, gate-checked journey — and where a broken vehicle becomes a scheduled, parts-costed, completed repair.

---

## 2. The five roles

Everyone who uses the system has exactly one role. Your role decides what you see, what you can do, and which screen greets you when you log in.

| Role | In plain terms | What they're responsible for |
| --- | --- | --- |
| **Admin** | The coordinator | Runs the whole system: manages vehicles, drivers, users, parts, tools and maintenance; approves trip requests and prepares their fuel budgets; assigns mechanics and completes repairs. |
| **Requester** | The person who needs a vehicle | Submits trip requests and tracks their own requests through approval. |
| **EVP Operations** | The senior approver | Approves the **fuel budget** on trips and gives the final go-ahead on **repairs**. The financial/authority checkpoint. |
| **Security Guard** | The gatekeeper | Checks vehicles **out** at the start of a trip and **in** at the end, at the gate. |
| **Driver** | The person behind the wheel | Sees the trips assigned to them and the job orders/tools relevant to their work. |

The **Admin** does most of the day-to-day setup and coordination. The **EVP Operations** role is deliberately narrow — it exists purely to approve money (fuel) and repairs. The **Security Guard** and **Driver** roles are the most focused of all: each lands on a single purpose-built screen.

---

## 3. Signing in and your session

**Logging in.** You sign in with your **email and password**. There is no self-service sign-up — an Admin creates every account. After a successful login you're taken straight to your role's home screen (see the next section).

**Demo accounts.** A fresh installation comes pre-loaded with one account per role so the system can be tried immediately. All of them use the password `Password123!`:

| Email | Role |
| --- | --- |
| `admin@mms.local` | Admin |
| `requester@mms.local` | Requester |
| `evp_operations@mms.local` | EVP Operations |
| `security_guard@mms.local` | Security Guard |
| `driver@mms.local` | Driver |

**Staying signed in.** Once you log in, the system keeps your session alive quietly in the background, so you won't be asked to sign in again every few minutes. A session can last up to about a week of ongoing use before it needs a fresh login.

**Signing out** ends your session immediately.

**Passwords.** You can change your own password (you'll need to enter your current one). An Admin can reset **anyone's** password without knowing the old one. Whenever a password changes, every existing session for that person is signed out, so a reset instantly locks out anyone who was using the old password.

**Account status.** An account can be **active** or **inactive**. An inactive account cannot log in, even with the right password.

---

## 4. What you see after you log in

The home screen (the "Dashboard") is **role-aware** — it shows a completely different thing depending on who you are.

| Your role | Your home screen is… |
| --- | --- |
| **Admin** | The full fleet dashboard: live vehicle counts, maintenance widgets, and the real-time tracking map. |
| **Requester** | The same fleet dashboard (an overview of the fleet's status and location). |
| **EVP Operations** | The **approvals** screen — two stacked panels: *Trip Ticket Approval* and *Job Order Approval* — everything waiting for their sign-off in one place. |
| **Security Guard** | The **Trip Ticket Guard Confirmation** screen — the gate checkpoint for checking vehicles out and in. |
| **Driver** | **My Trip Tickets** — only the trips assigned to them. |

### The navigation menu

On the left is a menu, organised into three groups: **Management**, **Assets**, and **Settings**. What appears in your menu depends on your role:

| Menu item | Group | Admin | Requester | EVP Operations | Security Guard | Driver |
| --- | --- | :---: | :---: | :---: | :---: | :---: |
| Dashboard | Management | ✅ | ✅ | ✅ | — | ✅ |
| Trip Tickets | Management | ✅ | ✅ | — | — | — |
| Job Orders | Management | ✅ | — | — | — | ✅ |
| Drivers | Management | ✅ | — | — | — | — |
| Maintenance | Management | ✅ | — | — | — | — |
| Vehicles | Assets | ✅ | — | — | — | — |
| Spare Parts | Assets | ✅ | — | — | — | — |
| Tools | Assets | ✅ | — | — | — | ✅ |
| Trackers | Settings | ✅ | — | — | — | — |
| User Management | Settings | ✅ | — | — | — | — |

A few things to notice:

- The **Admin** sees every menu item — they're the hub of the system.
- The **Security Guard** has no menu items at all; their whole job lives on the one confirmation screen they land on.
- The **EVP Operations** role only has the Dashboard, because their entire workflow (approvals) is on that one screen.
- The **Driver** has a small, focused menu: their trips, the job orders that concern them, and the tools they can borrow.

---

## 5. The building blocks

Before the workflows make sense, here are the records the system keeps. Admins set these up; everyone else works with them.

- **Branch** — a physical location or depot (e.g. *Main Branch*, *North Branch*). Vehicles, people, and trips all belong to a branch.
- **Department / Office** — an office within a branch (e.g. *Operations Office*). Trips are requested on behalf of an office.
- **Office Head** — the person who heads an office. A trip names the office head it's associated with.
- **User** — anyone who can log into the system, with exactly one role.
- **Driver** — a driver's personnel record (licence details, status). A driver record **can** be linked to a login account, but doesn't have to be — you can keep records for drivers who never sign in.
- **Vehicle** — a fleet vehicle, with make, model, plate, capacity, fuel type, mileage, insurance/registration expiry, photos, and a current status.
- **Spare part** — a workshop part with a stock quantity (e.g. *Brake Pads*).
- **Tool** — a workshop tool that can be borrowed and returned (e.g. *Torque Wrench*).
- **Maintenance standard** — a reusable maintenance plan made of **schedule items** (e.g. "change oil every 5,000 km"). Standards can be assigned to vehicles to generate their maintenance schedule.

---

## 6. Trip Tickets — the heart of the system

A **trip ticket** is a single request to use a vehicle for a journey. It carries everything about the trip: the destination and purpose, the requested vehicle and driver, the office and office head it's for, the list of participants and how many, the requested dates, and — once approved — a **fuel allocation** (the litres of fuel budgeted for the trip).

The trip ticket moves through a strict sequence of stages. Each stage is owned by a specific role, and the system will not let anyone skip a step, go backwards, or act out of turn.

### The lifecycle

```
                                (Admin approves + sets fuel budget)
  Requester submits            ┌──────────────────────────────────────┐
        │                      │                                      ▼
        ▼                      │                        Pending Fuel Allocation Approval
 Pending Admin Approval ───────┘                                      │
        │                                             (EVP approves the fuel budget)
        │                                                             ▼
        │                                                         Approved
        │                                                             │
        │                                          (Security Guard checks the vehicle OUT)
        │                                                             ▼
        │                                                        In Progress
        │                                          (Security Guard checks the vehicle IN)
        │                                                             ▼
        │                                                        Completed
        │
        └── At either pending stage, the trip can instead be:
              • Disapproved  (by Admin, or by EVP at the fuel stage) — with a reason
              • Cancelled    (by the requester who owns it, or by Admin) — with a reason
```

### Stage by stage

1. **Pending Admin Approval** — A requester (or an admin) submits the ticket. It is *always* born here; no one can create a ticket that's already approved. While it sits here, its own requester (or an admin) can still edit it. Once it moves past this stage, it can no longer be edited.

2. **Pending Fuel Allocation Approval** — The Admin approves the request and, at the same moment, prepares the **fuel allocation**: how many litres, what fuel type, the date, the purpose, and where it's going. This creates the fuel budget attached to the ticket, marked *pending*.

3. **Approved** — EVP Operations reviews the fuel budget and approves it. The fuel allocation is now stamped *approved*, and the trip is cleared to go.

4. **In Progress** — At the gate, the Security Guard **checks the vehicle out**. This records who the guard was and the time, and flips the vehicle from *available* to *on trip*. (The guard's screen includes a QR verification step to confirm the right ticket before proceeding.)

5. **Completed** — When the vehicle returns, the Security Guard **checks it in**. This records the post-trip guard and time, and flips the vehicle from *on trip* back to *available*. A completed trip also counts toward the "Trips Completed" figure on the dashboard.

### The two "off-ramps"

At either pending stage, a trip doesn't have to proceed:

- **Disapproved** — The Admin can disapprove at either pending stage; EVP Operations can disapprove at the fuel stage. A **reason is required**. If a fuel budget already existed, it's marked disapproved too.
- **Cancelled** — The requester who owns the ticket, or an Admin, can cancel at either pending stage. A **reason is required**. Any existing fuel budget is marked cancelled too.

### Who sees which trips

- **Admins and EVP** see **all** trips.
- A **Requester** sees only the trips **they submitted**.
- A **Driver** sees only the trips **assigned to them**.
- Filtering (by status, branch, driver, etc.) can only *narrow* what you're already allowed to see — a requester can never filter their way into someone else's trips.

### The key idea

The trip ticket is where three different people hand off to each other in a fixed order: the **requester** asks, the **admin** approves and budgets fuel, **EVP** signs off on the fuel, and the **guard** physically releases and receives the vehicle. The system enforces that order and quietly keeps the **vehicle's status** in sync at the check-out and check-in moments.

---

## 7. Job Orders — getting a vehicle repaired

A **job order** is the workshop counterpart to a trip ticket: it's how a vehicle gets repaired. Like trip tickets, it flows through fixed stages owned by specific roles, and the system keeps the vehicle's status and the parts inventory in sync as it goes.

### The lifecycle

```
  Someone reports a problem            (Admin "notes" it: assigns a
        │                               mechanic + lists spare parts)
        ▼                                         │
     Pending ─────────────────────────────────────┤
                                                   ▼
                                          Assigned Mechanic
   vehicle → under maintenance                     │
                                        (EVP approves the repair)
                                                   ▼
                                          Ongoing Repair
                                                   │
                                    (Admin completes the repair)
                                                   ▼
                                            Repaired
                                    vehicle → available;
                                    spare parts deducted from stock
```

### Stage by stage

1. **Pending** — A problem is reported. An Admin, requester, EVP, or driver can raise a job order (for example, describing a brake issue and the incident date). It's always born *pending*. While pending, an Admin can still edit it.

2. **Assigned Mechanic** — The Admin "**notes**" the job order: assigns a mechanic and lists the **spare parts** the repair will need (each with a quantity). At this moment the vehicle is flipped to **under maintenance**, so it can't be dispatched on a trip.

3. **Ongoing Repair** — EVP Operations approves the repair, and work begins.

4. **Repaired** — The Admin marks the repair complete. Three things happen automatically:
   - each listed spare part's stock is **reduced** by the quantity used,
   - a **service-history record** is written for the vehicle, and
   - the vehicle is flipped back to **available**.

> **Note on stock:** the system deliberately allows a part's quantity to go **negative** if you complete a repair that uses more than the recorded stock. Rather than blocking the repair, a negative number is left as a visible signal that the inventory count needs reconciling.

### Who sees which job orders

- **Admins and EVP** see **all** job orders.
- Other allowed roles (requester, driver) see only job orders **they requested** or that are **assigned to them**.
- The **Security Guard** has no access to job orders at all.

---

## 8. Vehicles and the fleet

Every vehicle has a **status** that reflects what it's doing right now. The status is central — trip tickets and job orders move it automatically, and the dashboard counts are built from it.

| Status | Meaning |
| --- | --- |
| **Available** | Ready to be dispatched on a trip. |
| **On trip** | Currently out on an approved, checked-out trip. |
| **Under maintenance** | In the workshop for a repair or service. |
| **Out of service** | Withdrawn from use. |
| **Unavailable** | Not available for dispatch (a catch-all "not usable right now"). |

**How status changes.** An Admin can set it directly when editing a vehicle, but most changes happen automatically: a guard **checking out** a trip sends a vehicle to *on trip* and **checking in** returns it to *available*; a job order being **noted** sends it to *under maintenance* and being **completed** returns it to *available*.

**Photos.** Vehicles can have multiple photos. When editing, new photos are added to the existing set, and you can remove specific ones.

**History.** Every time a vehicle's status changes, the system records it, so there's an audit trail of when the vehicle moved between states.

**Deletion guard.** A vehicle **cannot be deleted** if it's referenced by a maintenance record — the system blocks it rather than orphaning history.

**Who can see and change vehicles.** Any signed-in role can *view* vehicles. Only Admins can add, edit, or delete them.

---

## 9. Drivers

A **driver record** holds a driver's personnel details: name, contact, licence number and type, licence expiry, hire date, branch, and a status (**Active**, **Inactive**, or **On Trip**).

- A driver record **may be linked to a login account** (so that person can sign in and see their own trips), or it may exist purely as a personnel record for someone who never logs in.
- When an Admin creates a **driver-role user**, the system automatically creates or links a matching driver record — so the person's login and their personnel record stay connected.
- **Visibility:** Admins manage all drivers. A person with the driver role only ever sees **their own** driver record, never anyone else's.

---

## 10. Maintenance (three layers)

Maintenance in the system is three connected ideas: a **log** of what's been done, a **plan** for what should be done, and a **tracker** that applies the plan to each vehicle.

### Layer 1 — Service history (the log)

A running record of maintenance performed on vehicles: the type of work (preventive, corrective, inspection, repair, or service), the date, cost, mileage, and a description. Completed **job orders** automatically add a repair entry here. Admins can also add entries directly.

### Layer 2 — Maintenance standards (the plan)

A **maintenance standard** is a reusable plan — for example "Standard PMS" (preventive maintenance schedule). Each standard is made of **schedule items**, and each item is a task with an interval:

- by **mileage** (e.g. *Change Oil* every **5,000 km**, *Rotate Tires* every **10,000 km**), or
- by **time** (e.g. *Replace Coolant* every **12 months**).

Admins create standards, add or remove schedule items, and can delete a whole standard.

### Layer 3 — Per-vehicle maintenance tracking (the tracker)

When a standard is **assigned to a vehicle**, the system creates one tracking row per schedule item, each with a **next-due** point (a target mileage or date). Each row shows a **status** that's worked out automatically:

| Tracking status | What it means |
| --- | --- |
| **Pending** | Not due yet. |
| **Due soon** | Approaching its due point — within **30 days** or **500 km**. |
| **Overdue** | Past its due point. |
| **Completed** | Done for this cycle. |

The list is sorted **overdue first**, so the most urgent items rise to the top. When an Admin marks an item complete (recording the mileage it was done at), the system logs the completion and **recalculates the next due point** — adding the interval to get the next cycle's target (months roll forward on the calendar; mileage is added on).

---

## 11. Inventory — spare parts and tools

### Spare parts

The workshop's parts stock: each part has a name, brand, an optional photo, and a **quantity on hand**. Parts are consumed automatically when a repair (job order) is completed — the used quantities are deducted from stock. Admins manage the catalogue; anyone except the Security Guard can view it.

### Tools

The workshop's tools, each with a status: **available**, **borrowed**, **under maintenance**, or **out of service**. Tools support a simple **borrow / return** flow — when a tool is borrowed, the system records who borrowed it, the date, and the expected return date; returning it clears those out. Admins manage tools; **drivers can also view tools** (they appear in the driver's menu), while the Security Guard cannot.

---

## 12. Live GPS tracking and the map

The dashboard for Admins (and requesters) includes a **real-time map** of the fleet, centred on the Davao region.

- **Where the dots come from.** Vehicles fitted with GPS devices continuously report their position (latitude, longitude, speed, heading, and whether the engine is on). Each report updates the vehicle's last-known location and drops a point on its trail.
- **The physical trackers.** Vehicles are fitted with **SinoTrack ST-901** GPS trackers (2G). Each one reports over the mobile network to a small **gateway** service, which looks up which vehicle that tracker belongs to (from the Trackers registry) and feeds its position into the system. If a tracker isn't registered — or isn't assigned to a vehicle — its reports are ignored.
- **What the map shows.** The **latest** position of each vehicle, with a quick summary (make, model, plate, status). Full location **history** for a vehicle can also be reviewed.
- **The "Start Demo" button.** For demonstrations, the dashboard can simulate a vehicle driving a set route through Davao City — the marker updates every few seconds with fresh coordinates, speed, heading, and engine status. "Stop Demo" ends the simulation.
- **Who can see live tracking.** The detailed GPS views (latest positions and history) are limited to **Admins and EVP Operations**.
- **Security.** The device feed is locked down: only authorised GPS devices can send positions, using a secret key. If that key isn't configured, the feed is **closed by default** — it's never accidentally left open.

### 12.1 Tracker device registry (Admins)

Behind the live map is a registry of the physical GPS units. Admins manage it from the **Trackers** screen (under *Settings* in the menu):

- **Register a device.** Record a tracker by its **IMEI**, with an optional label, SIM number, lifecycle status, and free-text notes. A device may be left **unassigned** (a spare) or tied to a vehicle at registration.
- **Assign / replace.** A device can be assigned to a vehicle. A vehicle may have **at most one _active_ tracker** at a time — the system blocks a second active assignment, so replacing a unit means deactivating or decommissioning the old one first.
- **Lifecycle status.** Each device is *active*, *inactive*, or *decommissioned*. Only *active* devices feed live positions.
- **Online / offline.** Separately from lifecycle status, each device shows an **online/offline** indicator derived from how recently it last reported in (within the last few minutes = online).
- **Decommission / delete.** Devices can be decommissioned (kept for history) or deleted outright.
- **On the vehicle page.** A vehicle's detail page shows a read-only **GPS Tracker** panel with its assigned device's IMEI, status, and connectivity (Admins only).

**Who can manage trackers.** The Trackers registry is **Admin-only**, end to end (menu, pages, and API).

---

## 13. Analytics and smart insights

On top of the day-to-day records, the system offers three kinds of insight (available to Admins and EVP Operations):

- **Fleet dashboard metrics.** At-a-glance counts — how many vehicles are *available*, *under maintenance*, and *on trip*, plus the number of **trips completed**.

- **Predictive maintenance.** A per-vehicle **risk assessment** that ranks vehicles by how likely they are to need attention soon, based on mileage and maintenance patterns. Each vehicle gets a **risk score** and a **priority**, highest-risk first. If the predictive model can't produce a score for a vehicle, the system falls back to a straightforward rule-based estimate so there's always a ranking.

- **Spare-parts association rules.** Learned from past repairs — which spare parts tend to be replaced **together**. This helps anticipate what else a repair might need. It can be focused on a particular vehicle make.

---

## 14. User management

Admins manage all accounts from the **User Management** screen.

- **Creating a user.** An Admin sets the person's name, email, role, branch, an optional profile photo (avatar), and a password. Creating a **driver-role** user automatically creates or links a matching driver personnel record.
- **Editing a user.** Admins can update details and the avatar.
- **Passwords.** A person can change their own password (entering the current one first). An Admin can reset anyone's password **without** the old one. Either way, all of that person's active sessions are signed out.
- **Deleting a user.** Admins can delete accounts — but the system **won't let you delete your own account** (so you can't accidentally lock yourself out).
- **Roles available:** Admin, Security Guard, EVP Operations, Driver, Requester.

---

## 15. Who can do what — permissions at a glance

"View" means the area is visible and readable. "Manage" means create/edit/delete. Blank means no access.

| Area | Admin | Requester | EVP Operations | Security Guard | Driver |
| --- | --- | --- | --- | --- | --- |
| **Dashboard** | Full fleet view | Fleet view | Approvals view | — | My trips view |
| **Trip Tickets** | Manage all; approve; disapprove | Create + view own; cancel own | Approve fuel; disapprove at fuel stage | Check out / check in | View assigned |
| **Job Orders** | Manage all; note; complete | Create + view own | Approve repair; view all | — | Create + view own/assigned |
| **Vehicles** | Manage | View | View | View | View |
| **Drivers** | Manage | — | — | — | View own record |
| **Maintenance (history + standards + tracking)** | Manage | View | View | — | View |
| **Spare Parts** | Manage | View | View | — | View |
| **Tools** | Manage; borrow/return | View | View | — | View |
| **GPS live tracking + Analytics** | Full | — | Full | — | — |
| **Tracker device registry** | Manage | — | — | — | — |
| **User Management** | Manage | — | — | — | — |

> The **menu** you see (Section 4) is narrower than this table on purpose — it surfaces only the areas each role actually works in day to day, even where they technically have view access to more.

---

## 16. Status glossary

Every status label you'll see on a badge, in one place.

**Vehicle:** Available · On trip · Under maintenance · Out of service · Unavailable

**Trip ticket:** Pending Admin Approval · Pending Fuel Allocation Approval · Approved · In Progress · Completed · Disapproved · Cancelled

**Fuel allocation (attached to a trip):** Pending · Approved · Disapproved · Cancelled

**Job order:** Pending · Assigned Mechanic · Ongoing Repair · Repaired

**Driver:** Active · Inactive · On Trip

**Tool:** Available · Borrowed · Under maintenance · Out of service

**Maintenance tracking (worked out automatically):** Pending · Due soon · Overdue · Completed

**Account:** Active · Inactive

---

## 17. Rules the system always enforces

These are guarantees — the system will not let them be broken, regardless of who's using it:

- **Steps happen in order.** A trip ticket or job order can only move to the next allowed stage. You cannot skip a stage, move backwards, or act from the wrong stage — the system refuses it.
- **The right role, or nothing.** Each action belongs to a role. A guard can't approve fuel; a requester can't check a vehicle out. Acting out of role is refused.
- **You only see your own.** Requesters see only the trips they raised; drivers see only what's assigned to them. This can't be bypassed by filtering.
- **Approval creates the fuel budget.** The fuel allocation is prepared at the exact moment an Admin approves a trip, and confirmed when EVP approves it. Reasons are required to disapprove or cancel.
- **The gate keeps the vehicle honest.** Checking a trip out marks its vehicle *on trip*; checking it in marks it *available* again — always in step with reality.
- **Repairs settle up automatically.** Completing a repair deducts the parts used, logs the service history, and returns the vehicle to *available*.
- **Nothing is left dangling.** A vehicle tied to maintenance history can't be deleted, and you can't delete your own account.
- **The GPS feed is locked by default.** Only authorised devices can report positions, and if the feature isn't configured, it stays closed rather than open.

---

## 18. Role playbooks — a day in the life

### Requester
1. Log in → you land on the fleet dashboard.
2. Open **Trip Tickets** → create a new request: pick the destination, purpose, vehicle, driver, office/office head, participants, and dates.
3. Submit — the request starts at *Pending Admin Approval*.
4. While it's still pending you can **edit** or **cancel** it (with a reason).
5. Watch it progress: Admin approval → EVP fuel approval → *Approved*. You only ever see your own requests.

### Admin
1. Log in → the full fleet dashboard (counts, maintenance widgets, live map).
2. Review incoming trip requests → **approve** each one and set its **fuel allocation** (litres, type, date, purpose, destination), or **disapprove** with a reason.
3. Handle the workshop: raise or review **job orders**, **note** each one (assign a mechanic, list the spare parts) — this puts the vehicle *under maintenance* — and later **complete** the repair, which deducts parts and frees the vehicle.
4. Keep the fleet current: add/edit **vehicles**, **drivers**, **spare parts**, **tools**, and **maintenance standards**; assign standards to vehicles and mark tracked items complete.
5. Manage **users** and reset passwords as needed.

### EVP Operations
1. Log in → you land directly on the **Approvals** screen.
2. In the *Trip Ticket Approval* panel, approve the **fuel budgets** on trips waiting at the fuel stage (or disapprove with a reason).
3. In the *Job Order Approval* panel, approve **repairs** so work can begin.
4. Use the analytics and live tracking for oversight.

### Security Guard
1. Log in → you land directly on the **Trip Ticket Guard Confirmation** screen (you have no other menu).
2. For a departing vehicle: verify the ticket (including the QR check) and **check it out** — the vehicle becomes *on trip* and the trip becomes *In Progress*.
3. On return: **check the vehicle in** — the vehicle becomes *available* again and the trip is *Completed*.

### Driver
1. Log in → **My Trip Tickets** shows only the trips assigned to you.
2. Use the **Job Orders** menu to raise or follow repairs relevant to you.
3. Use the **Tools** menu to see workshop tools.

---

## 19. For developers

This README describes **what** the system does and **who** does it. For everything technical, see the **[Developer guide](docs/DEVELOPER_GUIDE.md)** — it covers the monorepo layout, prerequisites, the full API reference, environment variables, and scripts.

Quickstart:

```bash
docker compose up -d                     # start the local database
pnpm install                             # install dependencies
cp apps/api/.env.example apps/api/.env   # copy env config
pnpm db:migrate && pnpm db:seed          # set up the database + demo data
pnpm dev                                 # run the API and web app together
```

The web app runs at http://localhost:5173. See the Developer guide for the API address and configuration.
