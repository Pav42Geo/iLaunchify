# Stripe test-mode verification — concrete execution steps (2026-07-11)

Runnable companion to `STRIPE_TESTMODE_VERIFICATION.md` (that doc = *what each flow proves*; this doc = *do this, in this order, and check this*). Nothing here touches live money — test keys only, and the two money flags stay OFF until their step.

---

## ⚠️ Part 0 — Do this BEFORE the runbook (ordering dependency)

The runbook's **§2 fee check is stale** — it says "applicationFeeCents == 15% of subtotal / `computeApplicationFee` / `fees.test.ts`." The fee reconciliation (2026-07-09) changed the creator fee to the **subscription-tier rate** (Maker 15% / Builder 12% / Agency 8%) resolved via `resolveCreatorFeeBps`, and the checkout code that applies it is in a **staged patch not yet merged**.

**So verify Stripe AFTER Code lands the fee patch**, or you'll assert the wrong number:
1. Code applies `FEE_CREATOR_CHECKOUT_PATCH` + `FEE_SHIPDISPATCH_MERIT_PATCH`.
2. `pnpm db:push && pnpm db:generate && rm -rf apps/*/.next`.
3. `pnpm type-check && pnpm check:invariants --strict && node scripts/run-vitest-suites.mjs` all green.

Then the corrected §2 fee check is: `Charge.applicationFeeCents == round(feeBase × Order.platformFeeBps / 10000)` **and** `Order.platformFeeBps == 1500 / 1200 / 800` for the paying creator's tier. Cross-check against `packages/plans/creator-fee.test.ts` (not the retired `fees.test.ts`).

---

## Part 1 — One-time setup (Pavel, ~30 min)

1. **Stripe test account** → Dashboard in **Test mode** → Developers → API keys. Copy `sk_test_…` and `pk_test_…`.
2. **Install + log in the CLI:** `brew install stripe/stripe-cli/stripe` → `stripe login`.
3. **`.env.local`** (root — never commit):
   ```
   STRIPE_SECRET_KEY=sk_test_…
   STRIPE_PUBLISHABLE_KEY=pk_test_…
   CRON_SECRET=<any long random string>
   # leave these UNSET for now (the gates):
   # STRIPE_TRANSFERS_ENABLED=
   # STRIPE_REFUNDS_ENABLED=
   # STRIPE_CLAWBACK_NETTING_ENABLED=
   ```
4. **DB + apps up:** `pnpm compose:up` (CockroachDB) · `pnpm db:push && pnpm db:seed` · `pnpm dev` (all apps).
5. **Webhook forwarding** (one terminal per app you'll exercise; the printed `whsec_…` goes in `.env.local` as `STRIPE_WEBHOOK_SECRET`, then restart `pnpm dev`):
   ```
   stripe listen --forward-to localhost:3000/api/webhooks/stripe   # creator
   stripe listen --forward-to localhost:3002/api/webhooks/stripe   # partner (if exercising payouts)
   ```

## Part 2 — Preflight (2 min, must pass before any money)
```
node scripts/stripe-preflight.mjs .env.local
```
Must print the checks green and **refuse any `sk_live_` key**. If it flags the webhook secret, finish step 1.5 first.

**Test cards:** `4242 4242 4242 4242` (success) · `4000 0000 0000 0002` (decline) · `4000 0000 0000 9995` (insufficient funds).

---

## Part 3 — Execute the 9 flows in order

Run each, then verify with the DB (Prisma Studio `pnpm db:studio`, or a quick query). **Tick the Go/No-Go table in the runbook as you go.** Suggested split: **Pavel** drives the app/dashboard actions; **Code** verifies rows + runs crons + confirms idempotency.

| # | Action (Pavel) | Verify (Code / Studio) | Flag |
|---|---|---|---|
| **0** | run preflight | green, test key only | — |
| **1** | Onboard a test partner via Connect Express | `User.stripeAccountStatus`: `PENDING`→`ACTIVE` on `payouts_enabled` | — |
| **2** | Place a production order, pay `4242…` | 1 `Charge` (`applicationFeeCents` == tier-fee, see Part 0); `Order.status=PAID`+`platformFeeBps` snapshot; **2 dispatches** (or `ON_HOLD` if no partner). Resend event → no dup Charge | — |
| **2b-dry** | ship a dispatch → `curl -X POST localhost:3003/api/cron/execute-transfers -H "Authorization: Bearer $CRON_SECRET"` | `Transfer` stays `PENDING`, `executed:false`, **no Stripe transfer** | TRANSFERS **off** |
| **2b-exec** | set `STRIPE_TRANSFERS_ENABLED=true`, restart, ship + cron again | `stripe.transfers.create` (idem `transfer:<id>`); `Transfer.status=COMPLETED`; **merit withhold** (`meritFeeCents`) applied only if `MeritPolicy.enabled`; inactive partner **held** not failed | flip **on** |
| **3** | Place a SAMPLE order (credit-granting product), pay | `SampleCredit` `AVAILABLE`, **no dispatch**; resend → idempotent | — |
| **4a-dry** | approve a cancellation/refund on a paid order | audit `REFUND_PLANNED`, **no `Refund` row, no money** | REFUNDS **off** |
| **4b-exec** | set `STRIPE_REFUNDS_ENABLED=true`, restart, refund another order | `Refund` row + Stripe reversals per COMPLETED transfer + `PartnerClawback PENDING_APPROVAL`; **Σ reversals + platformShare == refundCents**; `charge.refunded` → `Order.REFUNDED` | flip **on** |
| **5** | Upgrade a creator via Stripe Checkout (subscription) | `CreatorProfile.stripeTierSubscriptionId` set, tier flipped, audit `CREATOR_TIER_CHANGE`; cancel → `cancelAtPeriodEnd`; delete → back to `MAKER` | — |
| **6** | Subscribe-and-save a run; advance the test clock one cycle | new PAID `Order`+`Charge` from `manifestSnapshot`, `runsCompleted++`; resend invoice → no dup Order; at `totalRuns` → `COMPLETED` | — |
| **7** | POST a bad `Stripe-Signature`; resend a duplicate `event.id` | bad-sig → 4xx no handler; dupe → `webhook.duplicate_skipped` `{duplicate:true}` | — |

Handy DB checks (Prisma Studio filters, or):
```sql
-- after §2
SELECT id, status, "platformFeeBps", "platformFeeCents" FROM "Order" ORDER BY "createdAt" DESC LIMIT 1;
SELECT "amountCents", "applicationFeeCents", "stripePaymentIntentId" FROM "Charge" ORDER BY "createdAt" DESC LIMIT 1;
-- after §2b
SELECT status, "amountCents", "meritFeeCents", "stripeTransferId" FROM "Transfer" ORDER BY "createdAt" DESC LIMIT 3;
```

---

## Part 4 — Go / No-Go → production
Only when **every row of the runbook's Go/No-Go table is ✅**:
1. Swap to **live** keys (`sk_live_…`, live `pk_`), register the **live** webhook endpoints (creator + partner `/api/webhooks/stripe`).
2. Set `STRIPE_TRANSFERS_ENABLED=true` and `STRIPE_REFUNDS_ENABLED=true` in **production** env.
3. Schedule the `execute-transfers` cron (every few minutes) — Vercel Cron passes `CRON_SECRET` automatically.
4. **Watch the first live one of each:** first live charge reconciles, first live partner payout lands, first live refund reverses correctly — *then* consider the money path launched. Keep `STRIPE_CLAWBACK_NETTING_ENABLED` off until you've watched a real clawback approve→net cycle.

## Division of labor (summary)
- **Pavel:** Stripe account + keys, Connect onboarding, placing orders / paying with test cards, tier upgrade, flipping the two flags at their steps, the go/no-go call.
- **Code:** verify DB rows per flow, run the `execute-transfers` cron, confirm idempotency (resend events), confirm the fee assertion against the **new** tier-fee model, wire the production webhook endpoints + cron.

**This is a ~half-day pass** once the fee patch is merged (Part 0). It's the single biggest remaining launch gate.
