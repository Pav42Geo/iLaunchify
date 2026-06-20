# Verification — order/financial flows (2026-06-20)

Review pass over this session's new code: creator cancel, creator dispute, admin
cancellation review + partner strike, admin dispute resolve, the cancellation-refund
and refund-plan engines. Self-review + an independent subagent pass.

## Clean (no change needed)

- **Auth/ownership** — every creator action scopes the order lookup to
  `creatorUserId: user.id` + a `role === 'CREATOR'` check; admin actions use
  `requireRole('ADMIN')`. No ownership hole.
- **Money math** — `computeCancellationOutcome` and `planRefund` clamp all inputs to
  ≥0, cap fees/reversals at the basis/charge, never go negative, and parts always sum
  to the whole (both golden-tested).
- **Window direction** — creator cancel (`creatorCancelWindowHours` from `createdAt`)
  uses the correct within/past comparison.

## Fixed this pass

1. **Partner strike rolled back the cancellation (high).** The `partnerStrike.create`
   sat inside the cancellation `$transaction`; with `partnerStrikeOnCancel` defaulting
   true and the table absent pre-migration, the throw poisoned the tx and broke every
   approval. → Moved out of the transaction, best-effort `.catch`, with
   `strike.recorded` recorded in the audit.
2. **Creator dispute create + status flip was non-atomic (high).** `orderDispute.create`
   and the `order → DISPUTED` update were two unguarded statements. → Wrapped in one
   `$transaction` (pre-migration the whole thing throws, which is fine — the feature
   isn't live until the table exists).
3. **Null `deliveredAt` bypassed the dispute window (med).** A delivered order with no
   `deliveredAt` skipped the window check entirely (unbounded dispute window). → Now
   rejects with "no recorded delivery date — contact support."

## Resolved (Pavel decision — option B, 2026-06-20)

4. **Admin cancellation approve wrote an FSM-illegal `PAID → CANCELLED` (high,
   pre-existing).** Decided: **CANCELLED is the "order voided" terminal**; any captured
   payment is returned via a separate `Refund` record (the deferred executor), not
   modeled in the FSM. → `order-fsm.ts` now allows `CANCELLED` from
   `PAID` / `ROUTING` / `IN_FULFILLMENT` (plus the existing `PENDING_PAYMENT` /
   `ON_HOLD`); `SHIPPED+` still can't be cancelled. `reviewCancellation` now
   `assertOrderTransition`s before approving and returns a clear error for shipped/
   delivered orders instead of writing an illegal state. FSM tests pin both the new
   legal edges and the shipped-is-illegal cases.

## Open — needs a decision (NOT changed here)

5. **Dedup is check-then-create, not atomic (low).** Concurrent requests could create
   two PENDING cancellation requests / OPEN disputes on one order. Single-click use is
   fine; harden later with a partial unique index.
