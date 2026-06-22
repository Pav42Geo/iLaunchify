# Mac deploy runbook — landing the admin-RBAC + integrations + payments work

This consolidates every pending Mac step from the 2026-06 session into one ordered
list. Everything additive is already in `packages/db/prisma/schema.prisma`, so a
single `db:push` reconciles the DB. Run from the repo root on your Mac.

## 0. Sanity (always first)

```bash
docker ps | grep frontend   # legacy FOD container squats :3000 — see CLAUDE.md
```

## 1. One additive db:push (decline any reset prompt)

```bash
pnpm db:push
```

`db:push` diffs the schema against your DB and applies whatever's missing — safe to
run regardless of which earlier pushes you already did. This session it adds (cumulatively):

- `enum AdminRole` + `User.adminRole`
- `model RoleCapability` (super-editable capability matrix)
- `model AdminInvite` + `enum AdminInviteStatus` + the two `User` back-relations
- `model IntegrationMeta` (integration key rotation tracking — no secrets)
- `AuditLog.actorAdminRole`
- `OrderDispute.partnerResponse` / `partnerRespondedById` / `partnerRespondedAt`
  (B.1 dispute partner-response step) + `NotificationEvent.PARTNER_ORDER_DISPUTED`
- `CreatorProfile.tierPaymentFailedAt` / `tierGraceUntil` (subscription dunning) +
  `NotificationEvent.CREATOR_PAYMENT_FAILED` / `CREATOR_SUBSCRIPTION_DOWNGRADED`.
  Also set `CRON_SECRET` for the new creator `/api/cron/tier-dunning` (daily 8am,
  `apps/creator/vercel.json`).
- `ProductTemplate.flavorsRunSequentially` (D5 multi-flavor lead time, default false).
- `model SupportRefundRequest` + `enum RefundRequestStatus`
- Support ticketing models/enums + `NotificationEvent` values (`SUPPORT_*`,
  `SUPPORT_REFUND_REQUESTED`) — if not already applied

## 2. Regenerate + clear the stale client

```bash
pnpm db:generate
rm -rf apps/*/.next     # transpilePackages bundles the old client into .next
```

(Restart any running `next dev` after this.)

## 3. Backfill — keep existing admins at full access

The `null adminRole → least-privilege` flip means a legacy admin with a null role
would otherwise lose access (this is why the Developer & API link and other
capability-gated items disappear). Run the idempotent backfill script once:

```bash
node scripts/make-super-admin.mjs --all          # every null-role admin → SUPER_ADMIN
# or target one account:
node scripts/make-super-admin.mjs georgiev.pavel@gmail.com
# inspect first without changing anything:
node scripts/make-super-admin.mjs --list
```

Equivalent raw SQL if you'd rather run it directly:

```sql
UPDATE "User" SET "adminRole" = 'SUPER_ADMIN' WHERE "role" = 'ADMIN' AND "adminRole" IS NULL;
```

> After generate the RoleCapability matrix starts EMPTY — newly-assigned non-super
> admins have zero capabilities until you grant them in **Admin → /roles** (or click
> Apply preset per role). Your backfilled account is SUPER_ADMIN, so it's unaffected.

## 4. Verify

```bash
pnpm typecheck                       # workspace-wide, expect clean
node scripts/run-pure-tests.mjs      # 7 pure suites (RBAC, invite, ownership, FSM, niche, phrase, restrictions)
node scripts/run-vitest-suites.mjs   # 136 money-path assertions
node scripts/verify-rbac.mjs         # preset ↔ 30 gated surfaces
pnpm --filter @ilaunchify/support test   # support FSM/intake (real vitest, post-install)
```

## 5. Optional cleanup — drop the cast-guard markers (NON-functional)

The `(prisma as unknown as {...})` cast guards still compile + run correctly against
the regenerated client — they're just temporary shims. Dropping them is cleanup, not
required for anything to work, and can be deferred or handed to Code. Files carrying
markers (`ADMIN-RBAC-CAST` ×12, `SUPPORT-*-CAST` ×3):

- `packages/db/src/{role-capabilities,admin-invites,integration-meta}.ts`
- `packages/auth/src/{capabilities,config}.ts`
- `packages/audit/src/log.ts`
- `packages/support/src/{service,notify}.ts`
- `apps/admin/src/app/(dashboard)/admins/{actions,page}.tsx`
- `apps/admin/src/app/(dashboard)/support-tickets/{[ticketId]/page,refund-requests/actions,refund-requests/page,saved-replies/actions}.tsx/.ts`
- `apps/admin/src/app/accept-invite/actions.ts`

For each: replace the `prisma as unknown as { … }` access with the now-typed
`prisma.<model>` and remove the marker comment; re-run `pnpm typecheck`.

## What goes live after this

- **Admin RBAC** — sub-roles, editable capability matrix + presets, grant/invite admins
  (link + email), accept-on-signup, least-privilege default.
- **Developer & API control center** — `/developer`: status, test-connection, rotation
  tracking; weekly rotation-due digest cron (set `OPS_ALERT_EMAIL` to receive it).
- **Payments** — unchanged at runtime; `STRIPE_REFUNDS_ENABLED` stays off until the
  Stripe test-mode runbook (`STRIPE_TESTMODE_VERIFICATION.md`) passes.
