# Order-lifecycle notifications

Coverage for the cancellation/dispute flows. Each transition: who should hear about
it, and whether it's wired.

## Coverage audit (2026-06-20)

Swept every `NotificationEvent` for a dispatch site. Most are wired (often via a
variable — `notifyAdmins(event, …)` in `workflow-notifications.ts`, the FSM mapper
`notificationEventForTransition` — so a literal `event: '…'` grep under-reports). The
genuinely never-dispatched events were:

- `ORDER_NEEDS_ATTENTION` → **fixed** (admin alerts below).
- `PARTNER_SUBMITTED` → **fixed**: partner onboarding `submitForReview` promotes to
  `IDENTITY_PENDING_REVIEW` but never told admins. Now fans out `PARTNER_SUBMITTED`
  (existing event + template) to all admins, best-effort, only on real promotion.
- `DISPATCH_ACCEPT_REMINDER` → intentionally deferred to V1.1 (needs the accept-window
  cron); left alone.

## Wired (2026-06-20, no migration)

Both reuse the existing `ORDER_NEEDS_ATTENTION` event (already templated → links to the
admin `/orders/[id]` page), fanned out to every admin, best-effort:

- **Creator opens a dispute** → admins (`openOrderDispute`, status `DISPUTED`).
- **Cancellation request filed** → admins (`requestOrderCancellation` review branch,
  status `CANCELLATION_REQUESTED`).

Before this, admins got no push signal at all for either — they'd have to poll the
queue. This closes the highest-value gap.

## Wired — built, pending the enum migration (2026-06-20)

Schema (`enum NotificationEvent`) + templates + dispatch calls are all in. They fire
correctly once the new enum values exist in the DB + generated client; the dispatcher
is best-effort so they're safe to call before then (a bad-enum write is swallowed).

| Event | Recipient | Fires from | Payload |
|---|---|---|---|
| `CREATOR_ORDER_CANCELLED` | order's creator (`Order.creatorUserId`) | admin `reviewCancellation` (APPROVED) | `{ orderId, refundCents? }` |
| `CREATOR_ORDER_DISPUTE_RESOLVED` | order's creator | admin `resolveOrderDispute` | `{ orderId, decision }` |
| `PARTNER_CANCELLATION_REVIEWED` | requesting partner (`requestedById`, if a Partner) | admin `reviewCancellation` (approve/deny) | `{ orderId, decision }` |

### Migration + cleanup (Mac)

1. `pnpm db:push` (adds the 3 enum values) → `pnpm db:generate` → `rm -rf apps/*/.next`.
2. Drop the temporary casts once the generated type knows the values:
   - `packages/notifications/src/templates.ts` — `switch (event as string)` → `switch (event)`.
   - `apps/admin/src/app/(dashboard)/cancellations/actions.ts` — remove the `evt()` cast helper, pass the literals directly.
   - `apps/admin/src/app/(dashboard)/orders/[orderId]/dispute-actions.ts` — drop the `as unknown as NotificationEvent` cast.

### Known small gap

A **creator** whose own cancellation request is DENIED gets no push (there's no
`CREATOR_CANCELLATION_DENIED` event). Low priority — they initiated it and saw the
in-app confirmation. Add an event if it proves needed.
