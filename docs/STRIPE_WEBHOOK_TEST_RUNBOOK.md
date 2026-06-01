# Stripe webhook end-to-end test runbook (punch-list #4)

Verifies the live payment → production flow against real Stripe test-mode events:

```
payment_intent.succeeded  → Order = PAID + Charge recorded + OrderDispatches created
invoice.payment_succeeded → next-cycle Order spawned (ProductionSubscription)
charge.refunded           → Refund recorded
transfer.*                → Transfer status synced
```

This is a **manual verification** (needs the Stripe CLI + test-mode keys). The code is
already built — see the audit notes at the bottom. Record a screen capture of a clean
run for the audit trail (PLATFORM_SPEC §Tier 4 #18 / DoD criterion #5).

---

## Code under test
- Route: `apps/creator/src/app/api/webhooks/stripe/route.ts` — verifies `stripe-signature`
  against `STRIPE_WEBHOOK_SECRET`, then calls `handleStripeEvent`. Returns 500 on handler
  error so Stripe retries.
- Handler: `packages/payments/src/webhook-handlers.ts` — `handleStripeEvent(event)` switch.

## Prerequisites
1. **Stripe CLI** — `brew install stripe/stripe-cli/stripe` then `stripe login`.
2. **Test-mode keys** in `.env.local`: `STRIPE_SECRET_KEY=sk_test_...`.
3. **Port 3000 gotcha** — the legacy FOD Docker container squats port 3000
   (CLAUDE.md gotcha #1). Before booting the creator app: `docker ps | grep frontend`
   and stop it (`docker stop <id>`) so `next dev` binds 3000.

## Setup
```bash
# Terminal A — forward Stripe events to the local webhook route
stripe listen --forward-to localhost:3000/api/webhooks/stripe
# → prints "Ready! Your webhook signing secret is whsec_xxxx"
```
Put that secret in `.env.local` as `STRIPE_WEBHOOK_SECRET=whsec_xxxx`, then (re)start the
creator app so it picks up the env:
```bash
# Terminal B
pnpm --filter @ilaunchify/creator dev   # port 3000
```

---

## Test 1 — payment_intent.succeeded → Order PAID + dispatches

**Critical:** `onPaymentSucceeded` reads `pi.metadata.ilaunchify_order_id` and **returns
early (no-op) if it's absent.** A bare `stripe trigger payment_intent.succeeded` has no
such metadata, so it will return `{handled:true}` but change nothing. Two valid paths:

- **Preferred (true E2E):** run a real test-mode checkout in the creator app to the
  payment step. The checkout sets `metadata.ilaunchify_order_id`; the webhook then fires
  naturally on the test card `4242 4242 4242 4242`.
- **Targeted:** trigger with the metadata for an existing DRAFT/PENDING Order id:
  ```bash
  stripe trigger payment_intent.succeeded \
    --add payment_intent:metadata.ilaunchify_order_id=<ORDER_ID> \
    --add payment_intent:amount=12900
  ```

**Expected DB state** (idempotent — re-firing the same PI is a no-op):
```sql
SELECT status, "paidAt" FROM "Order" WHERE id = '<ORDER_ID>';            -- status = PAID
SELECT "stripePaymentIntentId", status FROM "Charge" WHERE "orderId"='<ORDER_ID>'; -- SUCCEEDED
SELECT id, status FROM "OrderDispatch" WHERE "orderId" = '<ORDER_ID>';   -- 1+ rows (or order auto-held if no partner match)
```
Also check the `AuditLog` for the `ORDER_PAID` row.

## Test 2 — invoice.payment_succeeded → next-cycle Order

Only fires for **recurring** invoices. `onInvoicePaid` **skips `billing_reason =
'subscription_create'`** (the day-1 Order is created by the checkout path, not here) and is
idempotent per `stripeInvoiceId`. Best driven by creating a test ProductionSubscription and
advancing the billing clock in the Stripe test dashboard, or:
```bash
stripe trigger invoice.payment_succeeded
```
**Expected:** a fresh `Order` + `OrderItem` from the locked `manifestSnapshot`, routed
through `createDispatches`. Verify no duplicate Order exists for the same invoice id.

## Test 3 — refunds + transfers (smoke)
```bash
stripe trigger charge.refunded          # → Refund row recorded
stripe trigger transfer.created         # → Transfer status synced
```

---

## Pass criteria
- [ ] Signature verification rejects a tampered payload (400).
- [ ] payment_intent.succeeded with valid metadata → Order PAID + Charge + dispatches.
- [ ] Re-firing the same event is a clean no-op (idempotency).
- [ ] invoice.payment_succeeded (non-create) → exactly one new cycle Order.
- [ ] No 500s in the `stripe listen` log on the happy path.
- [ ] Screen capture saved for the audit trail.

## Audit notes (code review, 2026-06-01)
The flow is correctly wired and defensively built:
- Signature verified before any handler runs; handler errors return 500 → Stripe retries.
- `onPaymentSucceeded` is idempotent (skips if a Charge with the PI id exists) and writes
  Charge + Order=PAID in one transaction before routing dispatches.
- `onInvoicePaid` is idempotent per invoice id and correctly skips `subscription_create`.
- **Watch-out for the tester:** the `ilaunchify_order_id` metadata requirement above — the
  #1 reason a "trigger" appears to do nothing.
