// Every branch runs its own vans, and borrows another branch's when it needs to.
// Borrowing is ALLOWED — the API has never refused it and should not start; see
// the "ALLOWS a branch to borrow another branch's vehicle" test, which exists to
// stop someone tightening that into a branch check. But it is the exception, not
// the routine, and the person approving the trip is the one sanctioning it.
//
// So the rule is not "prevent" but "never let it happen silently". The van a
// branch owns is the default and sits at the top of the list; another branch's
// van is reachable, but under its own heading, tagged with whose it is, at every
// point someone might act on it: choosing it, reviewing it, approving it.
//
// A borrow is derivable — the trip carries the branch it is FOR, the vehicle
// carries the branch that OWNS it — so there is nothing to store and no
// migration. What matters is that every screen reads it the same way, which is
// why the comparison lives here and not in three components.
export function isBorrowed(
  tripBranchId: string | null | undefined,
  vehicleBranchId: string | null | undefined
): boolean {
  // Not knowing whose it is is not the same as it being someone else's.
  if (!tripBranchId || !vehicleBranchId) return false;
  return tripBranchId !== vehicleBranchId;
}
