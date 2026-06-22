# Payments / Order-Money Readiness

Status as of 2026-06-22. Scope: the deterministic money math behind orders,
payouts, refunds, fees, and cancellations.

## How to verify (zero install)

```bash
node scripts/run-vitest-suites.mjs     # runs the pure money-path suites via a shim
```

The real command on a provisioned machine is `pnpm --filter @ilaunchify/orders test`
and `pnpm --filter @ilaunchify/payments test` (real vitest). In the sandbox vitest
can't start (missing rollup native binary), so `run-vitest-suites.mjs` transpiles
the pure `*.test.ts` files and runs them against a minimal `expect` shim. They use
only `describe/it/expect` — no mocks, no async, no Prisma — so this is faithful.

**Last run: 109 assertions, 0 failures**, across 12 suites:

| Suite | Engine under test |
|---|---|
| payments/refund-plan | `planRefund` — refund → partner reversals + platform share |
| payments/fees | `computeApplicationFee` — 15% platform fee + $1 floor (NEW) |
| orders/transfer-planner | `computeTransferPlan` — order → manufacturer/print/creator splits |
| orders/cancellation-refund | `computeCancellationOutcome` — cancel fee + net refund |
| orders/cancellation-policy | creator self-cancel eligibility |
| orders/scoring | partner-match scoring weights |
| orders/dispatch-planner | order → per-partner dispatch decomposition |
| orders/aggregate-approval | multi-partner approval roll-up |
| orders/auto-cancel | `isOrderStale` unpaid-order auto-cancel window |
| orders/fsm | order status transition legality |
| orders/manifest-scope | per-partner manifest scoping |
| orders/transfer-planner (splits) | reason codes + destinations |

## Core invariants reviewed (not just "tests pass")

**`planRefund` (payments/refund-plan.ts) — refund money split.**
- Refund is clamped to `[0, chargeAmountCents]` — you can never refund more than was paid.
- Each partner transfer is recouped proportionally, capped at `min(transferAmount, remainingRefund, proportionalShare)` — a partner can never be over-recouped, and the cumulative `remaining` cap means reversals never exceed the refund.
- The platform absorbs the rounding remainder (`platformShareCents = refundCents − partnerRecoup`), which is therefore **never negative**.
- Exact identity holds by construction: `Σ reversals + platformShare == refundCents`.
- COMPLETED transfers → `REVERSE`; not-yet-sent → `CANCEL`.

**`computeTransferPlan` (orders/transfer-planner.ts) — payout split.**
- `creator = subtotal − manufacturerCost − printCost − applicationFee`; **throws** if that is negative (hard guard against over-allocating an order).
- `manufacturer + print + creator == subtotal − fee`; platform retains the fee. Shipping + tax are intentionally not split to partners.
- Fee = `max(floor(subtotal × rateBp / 10_000), floorCents)`, honoring a per-order `feeOverrideBp` (OrderSettings).

**`computeApplicationFee` (payments/fees.ts) — platform fee.** 15% default, $1 floor so micro-orders don't lose money to Stripe per-tx fees, rounds **down** (never over-charges), override-aware. Now covered by 8 assertions incl. the floor boundary + rounding direction.

## What is NOT unit-tested here, and why

The **execution glue** is Prisma/Stripe-bound and can't run as a pure unit test:
- `refund-execute.ts` (`executeOrderRefund`) — turns a `planRefund` into Stripe refund/reversal calls + DB rows. **Flag-gated by `STRIPE_REFUNDS_ENABLED`**: with the flag off it records intent (`REFUND_PLANNED`) and moves no money. It consumes the reviewed-and-tested `planRefund`, so the amounts are correct before the flag is ever flipped.
- `webhook-handlers.ts`, `checkout.ts`, `connect.ts`, `subscriptions.ts` — Stripe integration. These should be exercised against Stripe **test mode** before go-live (a manual/integration step, not a pure unit test).

## Low-priority follow-ups (non-blocking)

- `transfer-planner.ts` re-implements the fee formula inline instead of calling `computeApplicationFee`; both are tested and identical, but consolidating would remove the duplication (deferred to avoid an orders→payments dependency).
- `sample-credit.ts` / `sample-quote.ts` (sample-order economics) are pure but not yet unit-tested — lower stakes than the production-order money path.

## Bottom line

The deterministic money math — fee, payout split, refund split, cancellation
outcome — is reviewed, invariant-checked, and green (109 assertions). The only
un-unit-tested surface is the Stripe/DB execution layer, which is flag-gated and
consumes the tested plans.

**Go-live gate:** run `docs/STRIPE_TESTMODE_VERIFICATION.md` (8-flow runbook,
preceded by `node scripts/stripe-preflight.mjs`, which env-checks and refuses a
live key) against Stripe test mode before enabling live charges/refunds. Keep
`STRIPE_REFUNDS_ENABLED` off until the refund flow (§4) passes.
