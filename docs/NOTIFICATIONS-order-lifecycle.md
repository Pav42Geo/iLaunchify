# Order-lifecycle notifications

Coverage for the cancellation/dispute flows. Each transition: who should hear about
it, and whether it's wired.

## Wired (2026-06-20, no migration)

Both reuse the existing `ORDER_NEEDS_ATTENTION` event (already templated → links to the
admin `/orders/[id]` page), fanned out to every admin, best-effort:

- **Creator opens a dispute** → admins (`openOrderDispute`, status `DISPUTED`).
- **Cancellation request filed** → admins (`requestOrderCancellation` review branch,
  status `CANCELLATION_REQUESTED`).

Before this, admins got no push signal at all for either — they'd have to poll the
queue. This closes the highest-value gap.

## Follow-up — needs new NotificationEvent values (Mac migration)

`NotificationEvent` is a Prisma enum, so these need a schema migration + `db push` +
`db:generate` before they can be dispatched (the generated type gates the literal at
the call site). Add to `enum NotificationEvent`, add a `TemplateData` entry + switch
case in `packages/notifications/src/templates.ts`, then wire the dispatch:

| Event | Recipient | Fires from | Payload |
|---|---|---|---|
| `CREATOR_ORDER_CANCELLED` | order's creator | admin `reviewCancellation` (APPROVED) | `{ orderId, refundCents? }` |
| `CREATOR_ORDER_DISPUTE_RESOLVED` | order's creator | admin `resolveOrderDispute` | `{ orderId, decision }` |
| `PARTNER_CANCELLATION_REVIEWED` | the requesting partner | admin `reviewCancellation` | `{ orderId, decision }` |

Recipient resolution: creator = `Order.creatorUserId`; partner = the request's
`requestedById`. Pattern mirrors the admin fan-out already in `cancel-actions.ts` /
`dispute-actions.ts`, but to a single user.

These were left for a migration rather than forcing enum casts through the
notifications layer (cleaner to add them properly with the schema change).
