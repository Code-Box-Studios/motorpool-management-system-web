# Tracker packet logs

Status: approved by the user on 2026-11-06 for implementation.

## Intent and confirmed scope

The user wants a frontend view to check what each tracker sends. They explicitly selected **every incoming tracker packet**, including rejected fixes and errors, rather than only saved coordinate history.

Success means an administrator can see whether traffic arrived, inspect its original contents, and understand why it did or did not become a vehicle position. Unknown or unassigned trackers must remain visible.

## Approaches

1. **Dedicated packet log storage and a Tracker Logs screen — recommended.** Capture records at the gateway before position validation, store them through the existing API, and show them in the existing React application. This supports invalid packets, unknown devices, and raw payload inspection.
2. **Reuse GPS history — insufficient for the selected scope.** `gps_data` contains successful positions keyed by vehicle. It does not preserve the tracker identifier, raw packet, heartbeats, or rejection reasons.
3. **Expose the gateway service journal — insufficient as the application feature.** Current logs omit successful coordinates and heartbeats. A journal viewer would require separate infrastructure access and would not provide consistent device filters.

The user approved the dedicated packet log approach. Use the current Express, Prisma/Postgres, H02 TCP gateway, and React stack. Work directly on `main`.

## Capture behavior

- Log each complete H02 message, including heartbeats, supported positions, unsupported types, malformed messages, invalid fixes, and packets from devices without an active vehicle assignment.
- A TCP read is not a tracker message: a message can span reads, and a read can contain several messages. Continue using stream framing; do not create duplicate packet rows for network fragmentation.
- Instrument the framing boundary to preserve bytes it currently discards: binary/unrecognized prefixes, buffer-limit fragments, and unfinished data when a socket closes or times out. Store these as diagnostic fragment records. Correlate them with a connection ID; do not invent a tracker ID when the bytes cannot identify one.
- Capture receipt time, a generated event UUID, connection ID, remote peer, exact payload bytes, and any safely extractable tracker ID before validation or assignment lookup. Preserve repeated identical packets as distinct receipts.
- Record decoded message type, fix time, coordinates, speed, heading, and ignition when available. Coordinates from an invalid fix remain explicitly marked invalid and never update the vehicle location.
- Outcomes include received/pending, position saved, heartbeat, invalid fix, device unavailable, unsupported/malformed, incomplete/oversized fragment, resolution error, forwarding error, and socket error. A registry/API outage must not be labeled an unregistered device.
- Only a successful position ingest counts as position saved. Logging a packet must not mark a tracker online or change vehicle coordinates by itself.

## Persistence and failure handling

Add a separate packet-log model and migration. Keep the observed tracker ID as text, independent of a registry foreign key, so registration, reassignment, and deletion cannot erase or misattribute packet history. Store the resolved vehicle ID as a snapshot when known.

Use gateway-generated UUIDs as unique receipt keys. Store receipt time and database storage time separately. Preserve payloads as a reversible byte representation, with escaped text and hex presentations in the UI. Bound records to the framing limit; split larger discarded byte sequences into bounded fragment records rather than silently truncating them.

Persist receipt and subsequent outcome events to a local disk spool, then upload through the API using device-key authentication. Replay pending events after temporary API failures and gateway restarts. Make API writes idempotent and outcomes monotonic so retries cannot duplicate receipts or revert a final outcome to pending. A crash before processing finishes leaves an honest pending/unknown outcome; do not fabricate delivery success or automatically re-forward a position during log replay.

The spool directory must be configurable, writable by the deployed `mms` service user, and kept outside replaceable build files. Bound spool disk use and report capacity/write failures explicitly in the service journal; a full or failed disk cannot guarantee capture. Upload errors must not create unhandled promise rejections or silently disable logging. The implementation must document this limit rather than promise lossless capture under disk failure.

The API validates payload sizes, timestamps, enums, and optional decoded fields. Reads require the existing administrator role. Packet upload uses the existing gateway device key and must not accept anonymous requests. Raw device payloads render as text, never HTML.

Index the default newest-first listing and tracker-ID-plus-receipt-time lookup. Use stable cursor pagination with a receipt ID tiebreaker. Retain records without automatic deletion in this first version; no new retention policy or data deletion is authorized by this design.

## Frontend

Add an administrator-only **Tracker Logs** page, reachable from Tracker Devices. Add **View packet logs** to each tracker details screen, opening the same page filtered by its transmitted tracker ID.

Show newest receipts first. Include received time with timezone, tracker ID or “Unknown,” message type, outcome, coordinates when available, and an expandable detail view containing raw text/hex, fix time, peer, connection ID, resolved vehicle, and failure details.

Provide tracker-ID search, outcome and message-type filters, received-time range filters, manual refresh, and optional automatic refresh every five seconds. Pause automatic insertion while browsing older pages so rows do not jump. Show actual last-refresh time and a visible request-error state; refresh failure must not look like an empty log.

Include clear loading, empty, offline/error, unregistered-device, and unknown-fragment states. Mobile uses horizontally scrollable table content and a readable detail panel. Match the existing application's components and styling.

The screen states that capture begins after the updated gateway is deployed. Historical rejected packets cannot be recovered from GPS history. The preview uses fictional sample packets, not evidence of live tracker traffic.

## Validation and delivery

Verify stream fragmentation and coalescing, heartbeats, valid/invalid fixes, malformed and binary data, unregistered devices, lookup and forwarding failures, incomplete disconnects, spool recovery, retry deduplication, and outcome ordering. Verify API authentication/authorization, input bounds, filtering, and stable pagination. Check desktop/mobile navigation, raw payload escaping, empty/error states, refresh behavior, and tracker filtering in a real browser.

Run the relevant gateway/API tests, API typecheck, web build/lint, and `git diff --check`. Database, API, frontend, and gateway rollout must be coordinated; an older gateway will not populate this screen. Implementation and local verification are in scope after design approval. A push or production rollout requires the user's instruction.

## Builder decisions

The builder may choose module boundaries, exact endpoint paths and enum names, spool encoding/rotation, bounded upload batching/backoff, UI component arrangement, and test fixtures. Preserve the capture, durability, identity, authorization, and truthfulness requirements above.
