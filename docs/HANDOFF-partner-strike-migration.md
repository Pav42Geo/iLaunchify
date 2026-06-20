# Handoff — PartnerStrike migration (run on Mac)

The `PartnerStrike` model + `PartnerStrikeStatus` enum + `Partner.strikes` relation
were added to `packages/db/prisma/schema.prisma` (additive). The migration must run
on the Mac — the sandbox can't reach the local CockroachDB and the MCP Prisma is v7
(rejects `url = env()`). Until it runs, all `partnerStrike` access is cast-guarded.

## 1. Apply the schema

This repo applies local schema with **`prisma db push`**, not `migrate dev` (the
migrations folder lags far behind the schema, so `migrate dev` would see drift and
offer to RESET the DB — decline it). One push applies all pending additive models.

```bash
docker ps --filter name=ilaunchify-cockroach   # confirm (healthy) first
pnpm db:push        # from repo root — prisma db push, additive
```

## 2. Regenerate + clear stale client (all three layers)

```bash
pnpm db:generate
rm -rf apps/*/.next
# restart next dev
```

(Per `ilaunchify-dev-prisma-restart`: stale client lives in process memory,
`node_modules`, AND the `.next` webpack cache because `@ilaunchify/db` is in
`transpilePackages`.)

## 3. Post-migration cleanup — drop the cast-guards

Once the client knows `prisma.partnerStrike`, remove the two casts:

- `apps/admin/src/app/(dashboard)/cancellations/actions.ts` — replace
  `(tx as unknown as { partnerStrike: … }).partnerStrike.create(…)` with
  `tx.partnerStrike.create(…)`.
- `apps/admin/src/app/(dashboard)/partners/[partnerId]/page.tsx` — replace
  `(prisma as unknown as { partnerStrike: … }).partnerStrike.count(…).catch(() => 0)`
  with `prisma.partnerStrike.count(…)` (the `.catch` was only the pre-migration guard).

Then `pnpm --filter @ilaunchify/admin exec tsc --noEmit` to confirm.

## What it wires

`OrderSettings.partnerStrikeOnCancel`. When an admin **approves** a
`CancellationRequest` and the requester is a partner, a `PartnerStrike` (status
`ACTIVE`) is recorded against them, atomic with the order cancel. Creator-initiated
requests have no Partner row for the requester → no strike. Active strike count
shows as a rose chip on the admin partner detail header.

Not yet built (future): admin waive/expire actions on strikes, and any
trust/promotion consequence of accumulated strikes (V1 keeps it informational).
