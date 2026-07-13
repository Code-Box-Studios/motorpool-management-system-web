// The reference people say out loud: "approve TT-2050". Backed by a real
// database sequence (trip_tickets.ticket_no / job_orders.order_no), so it is
// sequential and quotable. UUIDs stay in the URL and the QR code; they never
// reach a screen.
export function formatRef(
  prefix: string,
  no: number | null | undefined
): string {
  if (no == null) return `${prefix}-—`;
  return `${prefix}-${no}`;
}
