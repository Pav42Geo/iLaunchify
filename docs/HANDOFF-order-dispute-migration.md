# Handoff — OrderDispute migration (run on Mac)

`OrderDispute` model + `OrderDisputeCategory` + `OrderDisputeStatus` enums +
`Order.disputes` + `User.disputesOpened/disputesReviewed` relations were added to
`packages/db/prisma/schema.prisma` (additive). The migration runs on the Mac (the
sandbox can't reach the local CockroachDB). Until it runs, all `orderDispute`
access is cast-guarded.

## 1. Start the DB (if not running) + migrate

```bash
pnpm compose:up                       # from repo root — starts ilaunchify-cockroach
cd packages/db
pnpm exec dotenv -e ../../.env.local -- prisma migrate dev --name order_dispute
```

## 2. Regenerate + clear stale client (all three layers)

```bash
cd ../.. && pnpm db:generate && rm -rf apps/*/.next   # then restart next dev
```

## 3. Post-migration cleanup — drop the cast-guards

Once the client knows `prisma.orderDispute`, replace the casts with direct access:

- `apps/creator/src/app/(dashboard)/orders/dispute-actions.ts` — the
  `(prisma as unknown as { orderDispute … }).orderDispute` block → `prisma.orderDispute`.
- `apps/admin/src/app/(dashboard)/orders/[orderId]/dispute-actions.ts` — both
  `(prisma … ).orderDispute` and `(tx … ).orderDispute` casts.
- `apps/admin/src/app/(dashboard)/orders/[orderId]/page.tsx` — the cast-guarded
  `openDispute` load (the `.catch(() => null)` was only the pre-migration guard).

Then `pnpm --filter @ilaunchify/creator exec tsc --noEmit` and the same for admin.

## What it wires

`OrderSettings.disputeWindowDays`. A creator opens a dispute on a delivered/completed
order within N days of `deliveredAt` (`openOrderDispute`), flipping the order to
`DISPUTED` (FSM-safe). Admin resolves/rejects (`resolveOrderDispute`), returning the
order to `COMPLETED`. Both sides are audited (`ORDER_DISPUTE_OPENED` /
`ORDER_DISPUTE_RESOLVED`).

Not built (future): any refund/credit consequence of a resolved dispute (rides the
payments refund capability), `UNDER_REVIEW` as an intermediate admin state, and a
dedicated admin disputes queue page (today disputes surface on the order detail).
