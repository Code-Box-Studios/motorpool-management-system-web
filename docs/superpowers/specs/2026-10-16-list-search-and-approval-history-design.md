# List Search and Approval History Design

**Status:** Design approved by the user on 2026-10-16

## Problem

Record lists do not provide a way to find a specific item quickly. This affects both table and grid views, and server pagination means filtering only the visible page would hide matching records on other pages. The EVP Approvals History view is also presented as cards, which makes decisions harder to scan and compare. The Spare Parts table still renders a thumbnail inside each Part cell, taking room from its details.

## Goals

- Add consistent search to record-list screens, including screens with table and grid views.
- Search the full result set before pagination, while preserving each list's current permissions, filters, and sorting.
- Make search state common to a list's table and grid views. Changing the search term returns the user to page 1.
- Make approval history easier to scan in a table while preserving the existing records and links.
- Remove the Spare Parts table thumbnail while retaining images in grid and detail views.

## Scope

Search covers the record-list screens for drivers, job orders, maintenance, spare parts, tools, tracker devices, trip tickets, users, and vehicles. It also covers Organization resource lists, the EVP approval queue and history, job-order approval history, and the requester's trip-history list.

Existing unpaginated lists may filter the complete data already loaded by the page. Paginated API lists must apply search on the server before pagination and return a count for the filtered result set.

## Search behavior

Each list gets a labeled search field above its table, grid, or list. The same search value controls both table and grid presentations. Search trims surrounding whitespace and matches partial text without case sensitivity against human-readable fields shown by that list: identifiers and references, names and titles, descriptions, statuses, and related record labels such as vehicle plates, drivers, branches, or roles. Numeric metrics and dates are not searchable unless they form part of a human-readable reference.

An empty search value shows the normal list. Search combines with existing list filters and sorting. Search changes reset pagination to page 1. The existing loading and error behavior remains in place. When there are no matches, the list displays an empty state that says no records match the search and offers a way to clear it.

## Approvals navigation

Keep the existing Needs You and History tabs and the Fuel and Repair groupings in the pending queue. Search applies to the active tab. Keep approve, decline, and view actions in the pending queue unchanged.

Replace the History cards with a table. Each row preserves the decision reference and type, request title, vehicle label, outcome, decision maker and role, decision date, any decline reason, fuel amount and type when present, and the existing view link. The current newest-first ordering remains.

## Spare Parts table

Remove the image thumbnail from the Part cell. Keep the Part name, Brand, On hand, Stock, and Description columns. Images remain available in Grid view and on the part detail page.

## Acceptance criteria

1. A search for a partial, differently cased identifier or name finds matching records across every page of each paginated list.
2. Search results retain the list's current authorization scope, filters, and sorting, and pagination counts reflect only matches.
3. Switching between Table and Grid preserves the current search and shows the same result set.
4. Clearing search restores the unfiltered list and page 1.
5. Empty search results are clear, and the user can clear the search without leaving the list.
6. Approval History is a table containing all decision details and working links that were available in the cards.
7. Pending approval actions still work and remain visible in their existing groups.
8. The Spare Parts table has no row thumbnail; Grid and detail images still render.

## Not in scope

- Changing approval permissions, decision workflows, or record data.
- Adding new list filters or changing existing sort options.
- A global search spanning unrelated list types.
