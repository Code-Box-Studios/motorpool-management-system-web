# Trip Ticket Flow Update - Implementation Plan

## Overview

Updated the trip ticket creation flow to implement a multi-stage approval process:

1. Requester creates trip ticket → Status: `pending_admin_approval`
2. Admin approves and creates fuel allocation → Status: `pending_fuel_allocation_approval`
3. EVP Operations approves fuel allocation → Status: `approved`
4. Guard checks in (pre-trip) → Status: `in_progress`
5. Guard checks out (post-trip) → Status: `completed`

## Database Schema (Already Updated)

### Trip Tickets Table

- **requested_by**: UUID of the user creating the request
- **office_head_id**: UUID referencing admins table
- **branch_id**: UUID referencing branches table
- **office_id**: UUID (for future offices table)
- **purpose**: Long text describing trip purpose
- **participants**: Array of strings (participant names)
- **participants_count**: Integer count of participants
- **cancellation_reason**: Text (required when status = cancelled)
- **disapproved_reason**: Text (required when status = disapproved)
- **fuel_allocation_id**: UUID referencing fuel_allocations table
- **vehicle_id**: UUID referencing vehicles table
- **driver_id**: UUID referencing drivers table
- **destination**: String
- **start_ts**: Timestamp (pickup date/time)
- **end_ts**: Timestamp (return date/time)
- **attachment_path**: String (file path from bucket)
- **pre_trip_checked_by**: UUID (nullable, references auth.users)
- **pre_trip_checked_at**: Timestamp (nullable)
- **post_trip_checked_by**: UUID (nullable, references auth.users)
- **post_trip_checked_at**: Timestamp (nullable)

### Status Values

1. `pending_admin_approval` - Initial state when requester creates ticket
2. `pending_fuel_allocation_approval` - Admin approved, waiting for EVP
3. `cancelled` - Requester/Admin cancelled (requires cancellation_reason)
4. `disapproved` - Admin/EVP disapproved (requires disapproved_reason)
5. `approved` - Fully approved by admin and EVP
6. `in_progress` - Auto-set when pre_trip_checked_by is filled
7. `completed` - Auto-set when post_trip_checked_by is filled

## Implementation Status

### ✅ Completed

1. Updated `TRIP_TICKET_STATUS` enum in [src/lib/enums.ts](src/lib/enums.ts)
2. Updated trip ticket form schema in [src/components/pages/trip-tickets/add-trip-ticket/actions.ts](src/components/pages/trip-tickets/add-trip-ticket/actions.ts)
3. Simplified form to focus on requester inputs

### 🔄 To Do

#### 1. Update Trip Ticket Create Form UI

File: `src/components/pages/trip-tickets/add-trip-ticket/page.tsx`

Need to update form fields to include:

- Branch selection
- Office Head selection (from admins)
- Purpose (textarea)
- Participants (textarea - comma separated)
- Participants count (number input)
- Vehicle selection
- Driver selection
- Destination
- Start date/time
- End date/time
- Remarks (optional textarea)
- File upload for attachment

Remove/Hide:

- Status selection (auto-set to pending_admin_approval)
- Approved by fields
- All fuel allocation fields (moved to separate flow)
- Guard check fields

Auto-fill:

- requested_by (current user ID)
- date_requested (today)

#### 2. Create Fuel Allocation Form

File: `src/components/pages/fuel-allocations/create-fuel-allocation.tsx` (NEW)

Form fields:

- Date (from trip ticket date_requested)
- Trip to/Destination (from trip ticket)
- Purpose (from trip ticket)
- Vehicle (from trip ticket)
- KM (number input)
- Liters (number input)
- Fuel Type (from vehicle fuel_type)
- Requested by (admin creating allocation)
- Branch (from trip ticket)
- Status (pending by default)

#### 3. Update Trip Ticket Detail/Edit Page

File: `src/components/pages/trip-tickets/trip-tickets-inner/index.tsx`

Add action buttons based on status and user role:

- **Admin actions** (when status = pending_admin_approval):
  - Approve → Opens fuel allocation form
  - Disapprove → Requires reason, sets status to disapproved
- **EVP Operations actions** (when status = pending_fuel_allocation_approval):
  - Approve fuel allocation → Sets trip ticket status to approved
  - Disapprove → Requires reason
- **Security Guard actions** (when status = approved):
  - Pre-trip Check → Fills pre_trip_checked_by and pre_trip_checked_at
  - Post-trip Check → Fills post_trip_checked_by and post_trip_checked_at
- **Requester actions** (when status = pending_admin_approval):
  - Cancel → Requires reason, sets status to cancelled

#### 4. Create Fuel Allocation Queries

File: `src/lib/query/fuel-allocations.ts` (NEW)

```typescript
export const useFuelAllocations = (page = 1, limit = 10) => {
  // Get all fuel allocations with pagination
};

export const useFuelAllocation = (id: string) => {
  // Get single fuel allocation
};

export const usePendingFuelAllocations = () => {
  // Get fuel allocations pending EVP approval
};
```

#### 5. Create Fuel Allocation Mutations

File: `src/lib/mutation/fuel-allocations.ts` (NEW)

```typescript
export const useCreateFuelAllocation = () => {
  // Create new fuel allocation
  // Update trip ticket status to pending_fuel_allocation_approval
};

export const useApproveFuelAllocation = () => {
  // Approve fuel allocation
  // Update trip ticket status to approved
};

export const useDisapproveFuelAllocation = () => {
  // Disapprove with reason
};
```

#### 6. Create Fuel Allocation Supabase Functions

File: `src/lib/supabase/fuel-allocations.ts` (NEW)

```typescript
export const createFuelAllocation = async (data) => {
  // Insert into fuel_allocations table
  // Update trip_ticket.fuel_allocation_id
  // Update trip_ticket.status to pending_fuel_allocation_approval
};

export const approveFuelAllocation = async (id, approvedBy) => {
  // Update fuel_allocations.status = 'approved'
  // Update fuel_allocations.approved_by_evp = approvedBy
  // Update related trip_ticket.status = 'approved'
};
```

#### 7. Update Trip Ticket Mutations

File: `src/lib/mutation/trip-tickets.ts`

Add:

```typescript
export const useApproveTripTicket = () => {
  // Admin approves - redirects to fuel allocation form
};

export const useDisapproveTripTicket = () => {
  // Sets status to disapproved with reason
};

export const useCancelTripTicket = () => {
  // Sets status to cancelled with reason
};

export const usePreTripCheck = () => {
  // Fills pre_trip_checked_by and pre_trip_checked_at
  // Auto-updates status to in_progress
};

export const usePostTripCheck = () => {
  // Fills post_trip_checked_by and post_trip_checked_at
  // Auto-updates status to completed
};
```

#### 8. Create Status Badge Component

File: `src/components/shared/trip-ticket-status-badge.tsx` (NEW)

Display appropriate color and text for each status:

- pending_admin_approval → Yellow/Warning
- pending_fuel_allocation_approval → Orange
- cancelled → Red
- disapproved → Red
- approved → Green
- in_progress → Blue
- completed → Green/Success

#### 9. Update Trip Tickets List Page

File: `src/components/pages/trip-tickets/index.tsx`

- Add status badge
- Filter by status
- Show appropriate actions based on user role

#### 10. Create Office Heads & Offices Tables (Future)

Currently using admins table for office_head_id. May need separate tables later.

## Testing Checklist

- [ ] Requester can create trip ticket
- [ ] Trip ticket starts with `pending_admin_approval` status
- [ ] Admin can see pending requests
- [ ] Admin can approve and create fuel allocation
- [ ] Status changes to `pending_fuel_allocation_approval`
- [ ] EVP Operations can see pending fuel allocations
- [ ] EVP can approve fuel allocation
- [ ] Status changes to `approved`
- [ ] Guard can perform pre-trip check
- [ ] Status auto-changes to `in_progress`
- [ ] Guard can perform post-trip check
- [ ] Status auto-changes to `completed`
- [ ] Cancellation requires reason
- [ ] Disapproval requires reason

## Notes

- Participants field accepts comma-separated names and converts to array
- File upload for attachments needs bucket configuration
- Guard checks should be restricted to security_guard role
- EVP approval restricted to evp_operations role
- Status transitions should be validated in backend
