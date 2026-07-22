# Runbook: wake the channel tables (db:push) — 2026-07-20

**Goal:** the entire A2 channel system (listing modes, OnDemandEnablement, InventoryPool
+ ledger, ChannelOrder ingest, all four full-service gates) is coded and dark behind
cast-guards. One `db:push` + `db:generate` wakes it. This runbook is the safe order of
operations. Run on the Mac (Cowork's sandbox cannot run Prisma engines).

## Phase 0 — preconditions (two-agent rules)

- [ ] Code agent idle, working tree clean for `packages/db/**` (single-writer rule).
- [ ] All pending commits from the on-demand sessions pushed.
- [ ] Stop `next dev` (all apps) before generate; the stale-client trap has THREE
      layers and a running dev server holds one of them.

## Phase 1 — preview what push will do (read-only)

```bash
cd packages/db
export DATABASE_URL=$(grep -E "^DATABASE_URL" ../../.env.local | head -1 | cut -d= -f2- | tr -d '"')
pnpm exec prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script | tee /tmp/push-preview.sql
```

Read `/tmp/push-preview.sql` before touching anything:

- **Expected:** `CREATE TABLE` / `ALTER TABLE ... ADD COLUMN` for the channel models
  (ChannelOrder, ChannelOrderLine, ChannelVariantLink, OnDemandEnablement,
  InventoryPool, InventoryLedger, ChannelSyncEvent, ChannelProductLink mode/price/
  publishState cols, Channel ops cols) and whatever ELSE is pending in the schema
  (MB-1 batch columns, etc.). `db:push` applies EVERYTHING pending, not just channels;
  know what's riding along.
- **STOP if you see any `DROP TABLE` or `DROP COLUMN`.** Migrations are additive
  (CLAUDE.md); a DROP means schema drift that needs a decision first, not a push.
- Note whether `OnDemandEnablement` appears as CREATE TABLE (never pushed) or not
  (already live). This decides the §3-renames question below.

## Phase 2 — the push (the full incantation, all four steps)

```bash
pnpm db:push
pnpm db:generate
rm -rf apps/*/.next
pnpm dev
```

Do not skip step 3: `@ilaunchify/db` is in `transpilePackages`, so the OLD client is
bundled inside `.next` (the 2026-06-05 trap).

## Phase 3 — verify (run the thing)

```bash
pnpm typecheck && pnpm check:invariants
pnpm --filter @ilaunchify/orders test
pnpm mode:delta      # re-run now that reads are live against real rows
```

Then click through the enablement loop once on the stub adapter:

1. Creator: product publish page → Sell section shows the on-demand eligibility state
   (blockers listed if the product isn't full-service).
2. Request enablement → appears in the partner `/on-demand` queue → ENABLE (capacity).
3. Configure listing ON_DEMAND → Push → goes LIVE only with enablement + eligibility.
4. BULK path: record a delivery → pool > 0 → bulk listing goes LIVE.
5. Channels → Sync now → stub orders ingest → gates fire → READY / ON_HOLD /
   NEEDS_ATTENTION with concrete reasons. (Stops at READY: C2.2 is unbuilt.)

## Phase 4 — unlocked follow-ups (each its own session)

- **Cast-guard burndown:** with the client generated, the `d('onDemandEnablement')` /
  `as unknown as` sites in publish/actions, on-demand/actions, ingest can become typed
  reads. CHECK 14/18 keep guarding the semantics meanwhile.
- **§3 renames (disambiguation doc):** still DEFERRED, and the calculus changed since
  it was written: the string-literal 'ON_DEMAND' sites have GROWN (SellChannels,
  ingest §2c, tier-pricing mode param), and live enums need `ALTER TYPE ... RENAME
  VALUE` which db:push does not emit. If Phase 1 showed OnDemandEnablement as CREATE
  TABLE, the cheapest-ever rename window is BEFORE first push, but it still costs a
  full sweep of cast-guarded string sites with zero compiler help. Recommendation
  stands: don't, until a dedicated session wants it.
- **C2.2 router (fresh session, money path):** READY → production order priced via
  `resolveTierGoodsCents(templateId, qty, 'ON_DEMAND')` → `assertSinglePartnerPlan`
  (CHECK 18 enforces) → auto-charge saved method, daily cap, ON_HOLD → plus the
  payment-method-on-file go-live gate in pushListing. Buildable in Stripe test mode.
