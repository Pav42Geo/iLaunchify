# Payments & Stripe Connect — Decisions

> ⚠️ **Model correction 2026-05-19 — large portions of this doc are stale.**
>
> This document was drafted under the old assumption that **consumers pay iLaunchify** through a hosted storefront. That model has been retired. The corrected V1 model:
>
> - **Consumer money never touches iLaunchify.** Consumers buy on the creator's external channel (Shopify, Amazon, Etsy, etc.). The creator's revenue stays in their channel's payout account.
> - **Creators pay iLaunchify** for production orders only. That's the single money flow iLaunchify is involved in.
> - Application fee is taken from the creator's production payment, not from a consumer subtotal.
> - Refunds / chargebacks from end buyers happen entirely on the channel side. iLaunchify does not observe them.
>
> The Stripe Connect Express partner-side architecture (Decision 2, partner accounts, Transfer queueing on dispatch shipped) is **still correct** — partners are paid by iLaunchify from the creator's production payment, gated on fulfillment milestones.
>
> Decisions 1, 3, 4, 5, 6, 7 contain consumer-flow examples and merchant-of-record reasoning that no longer apply. They will be rewritten when the production-order checkout (`/products/[id]/order`) is built. Until then, treat anything below describing "consumer pays $X" or "consumer chargeback" or "Stripe Tax for US sales tax" as documenting the deleted model.
>
> Canonical references for the corrected model: `docs/STOREFRONT.md` + memory file `ilaunchify-business-model.md`.

---

**Status:** Draft for Pavel approval. Once accepted, the V1 schema port adds the payment models below and the integration begins in Week 8 per `docs/ROADMAP.md`.

**The seven decisions in this doc:**
1. Merchant of record (who Stripe sees as the seller).
2. Stripe Connect account type per role.
3. Money flow (charge model + when transfers happen).
4. Application fee model (platform's cut).
5. Refunds, chargebacks, disputes.
6. Tax + 1099 handling.
7. Stripe products in V1 vs. V1.5.

---

## Decision 1 — Merchant of record: **iLaunchify is the merchant**

### The choice

iLaunchify charges the consumer's card directly. Creators, manufacturers, and print providers are all *paid-out parties* via Stripe Connect Express, not merchants of record.

### Why

The marketplace literature (Stripe's own docs, Shopify vs Etsy patterns) describes three models. We pick the third:

| Model | Who consumer sees on statement | Risk to platform | Operational complexity for creators | Fit for iLaunchify |
|---|---|---|---|---|
| **Pass-through** — creator is merchant | Creator's business name | Low (creator owns chargebacks) | **Very high** (creator owns chargebacks, tax, KYB) | ❌ Wrong for Tier 1 creators (10K–100K followers) — they don't want this complexity |
| **Shared** — creator is merchant for payment, platform handles disputes | Creator's name (mostly) | Medium | Medium | ❌ Convoluted; Stripe support of this is uneven |
| **Platform of record** — platform is merchant, creators are payees | Platform name (or custom descriptor) | Higher (platform owns chargebacks) | **Very low** (creators just get paid) | ✅ Matches creator persona |

The trade-off is real — iLaunchify takes on chargeback risk in exchange for a dramatically lower friction onboarding experience for creators. The research-validated persona ("emerging creator validating their first product") will *not* tolerate a full KYB + chargeback management workflow as part of signing up.

### What we do about the brand-experience problem

Statement descriptor: Stripe lets us set a **dynamic statement descriptor** per charge, so the consumer's bank statement shows the *creator's* brand:

```
Statement: "ACMEFOODS * VITAMIN D"   (NOT "ILAUNCHIFY *...")
```

Stripe rules: 22-char max, must be tied to a valid descriptor prefix configured on the platform Stripe account. Setup is one-time; per-charge override is one parameter.

The order confirmation email, receipt, and storefront UI all use the creator's brand name. The consumer never sees "iLaunchify" except in fine print on the receipt ("Payment processed by iLaunchify, Inc. on behalf of Acme Foods").

### Out of V1

Per-creator merchant of record (the "pass-through" model) is a V2 candidate for high-volume creators who want it. Tier 3 creator-brands (1M+ followers, multi-SKU) are likely to ask for this. Schema and code paths are written so it's a feature flag flip, not a rewrite.

---

## Decision 2 — Stripe Connect account types

### The choice

**Stripe Connect Express for all three party types (Creator, Manufacturer, Print Provider).**

### Why Express (not Standard, not Custom)

| Type | Onboarding speed | UX control | PCI scope | KYC/KYB | Dashboard for party | Our fit |
|---|---|---|---|---|---|---|
| **Standard** | Slow (full Stripe account) | None (Stripe owns flow) | Lowest | Stripe handles | Full | Wrong — too much friction for creators |
| **Express** ✅ | Fast (hosted forms) | Medium (we link out) | Low | Stripe handles | Limited (just payouts) | Best balance |
| **Custom** | Custom | Maximum | Highest | We handle | None unless we build it | Wrong — too much KYC burden on us at V1 |

Express lets us:
- Send a creator/partner to a Stripe-hosted form via `accountLinks.create`.
- Stripe collects KYC for individuals (SSN last 4, DOB, address) or KYB for entities (EIN, beneficial owners, business address, etc.).
- Stripe issues 1099-K forms automatically — we don't touch tax reporting.
- The party gets an Express Dashboard showing their payouts.
- Connect API gives us a verified `acct_xxx` ID to use for transfers.

### Account type per role

- **Creator** → Express. Onboarded during creator signup (after first product but before first sale).
- **Manufacturer** → Express. Onboarded as part of the curated partner flow (per `USER_ROLES.md`).
- **Print Provider** → Express. Same flow as manufacturer.

### Schema

```prisma
model User {
  // ... existing fields
  stripeAccountId   String?  @unique   // Express acct_xxx — null until connected
  stripeAccountStatus StripeAccountStatus  @default(NONE)
}

enum StripeAccountStatus {
  NONE                // never started
  PENDING             // link sent, not yet completed
  RESTRICTED          // KYC/KYB incomplete — can't payout
  ACTIVE              // can receive transfers
  REJECTED            // Stripe rejected after review
  DEAUTHORIZED        // party disconnected the account
}
```

For `Partner`, the `stripeAccountId` lives on the `User` row (not `Partner.stripeConnectId` as the schema sketch in `USER_ROLES.md` had it — the Stripe account is keyed to a person/entity, and a Partner has exactly one User). Update USER_ROLES.md schema sketch accordingly during the schema port.

---

## Decision 3 — Money flow: **Separate charges + fulfillment-gated transfers**

### The choice

1. Consumer pays the platform's main Stripe account via Stripe Checkout.
2. Platform creates an Order in iLaunchify DB.
3. Platform holds the funds until fulfillment milestones trigger transfers.
4. Transfers go out to Manufacturer + Print Provider + Creator at the right moments.
5. Platform retains the application fee.

This is the **separate charges + transfers** pattern (Stripe's term: "Separate charges and transfers"). It gives us escrow-like control without being an escrow service.

### Why not destination charges

Stripe's alternative pattern, **destination charges**, sends the charge directly to a connected account with the platform's fee subtracted. Single charge, single transfer, simpler.

But destination charges only support **one** destination per charge. Our orders have two-to-three downstream parties (manufacturer + print provider + creator). We'd have to do separate transfers anyway. Might as well use separate charges + transfers from day 1 and keep the money on platform until we have proof of fulfillment.

### The flow concretely

Example order: $40 supplement bottle from a creator. Assume splits:

| Party | Cut | Amount | Triggers when... |
|---|---|---|---|
| Manufacturer | Cost of goods | $12 | `ProductDispatch.status = SHIPPED` |
| Print Provider | Cost of labels | $3 | `LabelDispatch.status = SHIPPED` |
| Creator | Margin (Creator's cut) | $19 | `Order.status = DELIVERED + returns_window_passed (default 14d)` |
| Platform | Application fee | $6 | At charge time, withheld from balance |
| **Total** | | **$40** | |

```
Day 0:   Consumer pays $40 → Platform's Stripe balance
         Order created. ProductDispatch + LabelDispatch in ASSIGNED state.

Day 3:   Print Provider marks LabelDispatch.status = SHIPPED
         → Transfer $3 to Print Provider Connect account
         → Print Provider's Stripe payout cycle takes over from there

Day 7:   Manufacturer marks ProductDispatch.status = SHIPPED
         → Transfer $12 to Manufacturer Connect account

Day 10:  Consumer marks order DELIVERED (or carrier webhook confirms)
         Order enters DELIVERED state.

Day 24:  14-day returns window passes without refund
         → Transfer $19 to Creator Connect account
         → Platform retains $6 application fee in platform balance
```

This pattern means **the platform's Stripe balance temporarily holds the gross amount, then disburses on a schedule**. Two consequences worth knowing:

- **Cash float / risk:** Platform balance grows with active orders. Stripe has working-capital products (and our own banking) to manage this.
- **Refund mechanics:** If consumer requests refund before all transfers happen, we just don't transfer. If refund happens after transfers, we use `reverseTransfer: true` to claw back — Stripe handles this if the connected account has sufficient balance, otherwise it shows as a negative balance against future payouts.

### Schema

```prisma
model Charge {
  id                  String       @id @default(cuid())
  orderId             String       @unique
  stripeChargeId      String       @unique
  stripePaymentIntentId String
  amountCents         Int
  currency            String       @default("usd")
  applicationFeeCents Int          // platform's cut (withheld at charge time)
  status              ChargeStatus
  statementDescriptor String?      // creator brand name (max 22 chars)
  createdAt           DateTime     @default(now())
  order               Order        @relation(fields: [orderId], references: [id])
  transfers           Transfer[]
  refunds             Refund[]
}

enum ChargeStatus {
  PENDING
  SUCCEEDED
  FAILED
  REFUNDED
  PARTIALLY_REFUNDED
}

model Transfer {
  id                  String       @id @default(cuid())
  chargeId            String
  destinationStripeId String       // acct_xxx
  destinationUserId   String       // foreign key for joining to User
  destinationType     TransferDestination
  amountCents         Int
  reason              TransferReason
  stripeTransferId    String?      @unique  // null while pending
  status              TransferStatus
  scheduledFor        DateTime?    // when conditions are met
  executedAt          DateTime?
  charge              Charge       @relation(fields: [chargeId], references: [id])
  user                User         @relation(fields: [destinationUserId], references: [id])
}

enum TransferDestination {
  CREATOR
  MANUFACTURER
  PRINT_PROVIDER
}

enum TransferReason {
  PRODUCT_COST          // → MANUFACTURER
  LABEL_COST            // → PRINT_PROVIDER
  CREATOR_PAYOUT        // → CREATOR (margin)
  CREATOR_BONUS         // V1.5+: promotions, referrals
  REFUND_CLAWBACK       // negative; reverses an earlier transfer
}

enum TransferStatus {
  PENDING               // scheduled, conditions not yet met
  READY                 // conditions met, awaiting cron
  EXECUTING             // Stripe API call in flight
  COMPLETED
  FAILED                // platform must investigate
  REVERSED              // clawed back by a later refund
}

model Refund {
  id                  String       @id @default(cuid())
  chargeId            String
  stripeRefundId      String       @unique
  amountCents         Int
  reason              RefundReason
  initiatedByUserId   String       // who clicked refund
  status              RefundStatus
  createdAt           DateTime     @default(now())
  charge              Charge       @relation(fields: [chargeId], references: [id])
  clawbacks           Transfer[]   // related REFUND_CLAWBACK transfers
}

enum RefundReason {
  DEFECTIVE
  WRONG_ITEM
  NOT_AS_DESCRIBED
  DAMAGED_IN_TRANSIT
  CHANGED_MIND
  COMPLIANCE_FAILURE
  OTHER
}

enum RefundStatus {
  PENDING
  SUCCEEDED
  FAILED
}
```

The Transfer state machine (`PENDING → READY → EXECUTING → COMPLETED`) is driven by:
- A scheduled job (BullMQ on Redis) that wakes every ~5 minutes.
- On each tick: query `Transfer WHERE status IN ('PENDING','READY') AND scheduledFor <= NOW()`, execute via Stripe API, advance state.
- Idempotency keys per Transfer row prevent double-payouts on retry.

---

## Decision 4 — Application fee: **percentage of GMV, capped, configurable per creator tier**

### The choice

V1 application fee model:

- **Base rate:** 15% of order subtotal (before shipping + tax).
- **Per-creator override:** Admin can set a custom rate per creator (`CreatorProfile.feeRateOverride`). Used for promotional partnerships, top-tier creators, etc.
- **Floor:** Minimum $1 per order so micro-orders don't lose money on Stripe's per-transaction fee.

### Why 15% baseline

This is the working number, not a final answer. For reference:
- Etsy: 6.5% transaction fee + listing + payment processing
- Faire: 15% on first orders, 25% on follow-up orders
- Pietra: 0% transaction fee, $25–$199/mo subscription
- Shopify: 0% transaction fee (creator owns merchant), $39–$399/mo subscription

iLaunchify's revenue model is closer to Faire than Shopify (we provide fulfillment orchestration + compliance, not just storefront hosting), so 15% is in the right neighborhood. Tune after first 10 real orders.

### Schema

```prisma
model PlatformFeeConfig {
  id                  String       @id @default(cuid())
  baseRateBp          Int          // basis points, 1500 = 15%
  floorCents          Int          @default(100)
  effectiveFrom       DateTime
  // Add new row on rate change; never edit historical rows (charges reference their fee at the time)
}

model CreatorProfile {
  // ... existing fields
  feeRateOverrideBp   Int?         // null = use platform default
  feeRateOverrideReason String?    // admin note for audit
}
```

Computing the fee at charge time:

```ts
function computeApplicationFee(order: Order, creator: CreatorProfile, config: PlatformFeeConfig): number {
  const rateBp = creator.feeRateOverrideBp ?? config.baseRateBp
  const fee = Math.floor(order.subtotalCents * rateBp / 10000)
  return Math.max(fee, config.floorCents)
}
```

---

## Decision 5 — Refunds, chargebacks, disputes

### Refunds (consumer-initiated, before chargeback)

- Consumer requests refund via the storefront order page → creates a `Refund` row in `PENDING`.
- Platform admin (or — V1.5+ — auto-approve based on rules) approves → call `stripe.refunds.create(charge_id, amount)`.
- If transfers haven't gone out: just cancel the pending transfers.
- If transfers have gone out: create `REFUND_CLAWBACK` Transfers (negative amounts) to reverse. Stripe handles the clawback if the connected account has sufficient balance; otherwise it becomes a negative balance on that account that pulls from future payouts.

### Chargebacks (bank-initiated)

- Stripe webhook fires when a chargeback is opened.
- Platform marks the charge `DISPUTED`. Holds all related pending transfers.
- Platform has 7 days to gather evidence and submit to Stripe.
- If platform wins: dispute closed, transfers can proceed.
- If platform loses: same as a forced refund — clawback transfers, eat the loss + Stripe's $15 dispute fee.

### Dispute exposure

Because iLaunchify is merchant of record, chargebacks land on us. The Connect parties don't see them directly — but our terms with creators and partners include a clawback clause: if the dispute traces to a defective product (manufacturer fault), we claw back from manufacturer's future payouts. Same with print providers.

Schema:

```prisma
model Dispute {
  id                  String       @id @default(cuid())
  chargeId            String       @unique
  stripeDisputeId     String       @unique
  amountCents         Int
  reason              String       // Stripe's reason code
  status              DisputeStatus
  evidenceDueBy       DateTime
  evidenceSubmittedAt DateTime?
  resolvedAt          DateTime?
  outcome             DisputeOutcome?
  charge              Charge       @relation(fields: [chargeId], references: [id])
}

enum DisputeStatus {
  NEEDS_RESPONSE
  UNDER_REVIEW
  CHARGE_REFUNDED
  WON
  LOST
}

enum DisputeOutcome {
  WON
  LOST
}
```

### Per-party clawback policy

Encoded in partner terms (legal work, not code), but the schema supports it:

```prisma
model PartnerClawback {
  id                  String       @id @default(cuid())
  partnerUserId       String
  refundId            String?
  disputeId           String?
  amountCents         Int
  reason              String
  status              ClawbackStatus
  createdAt           DateTime     @default(now())
}

enum ClawbackStatus {
  PENDING_APPROVAL    // admin reviews
  APPROVED
  EXECUTED            // applied against future payouts
  WAIVED              // platform absorbed the loss
}
```

---

## Decision 6 — Tax + 1099

### Sales tax

**Stripe Tax** handles US sales tax. We enable it on Stripe Checkout sessions. Per-state nexus tracking is done by Stripe; we register in states where we hit thresholds (Stripe shows the dashboard).

Tax is collected as a separate line item, added to the charge total, remitted to the right state by Stripe. Not transferred to creators or partners.

Schema-wise, tax is a field on `Order`:

```prisma
model Order {
  // ... existing fields
  taxCents            Int
  shippingCents       Int
  subtotalCents       Int          // pre-tax, pre-shipping (this is the application-fee base)
  totalCents          Int          // subtotal + tax + shipping
}
```

### 1099-K

Stripe Connect Express **automatically issues 1099-K** to connected accounts that hit IRS thresholds ($600 in 2024+ rules, periodically re-debated). Platform doesn't touch this.

### Pavel's tax burden

Platform pays:
- Stripe processing fees (2.9% + $0.30 per charge in US).
- Stripe Connect fees (0.25% + $0.25 per active connected account per month, plus per-transfer fees).
- Stripe Tax (0.5% of taxable transactions).
- Income tax on platform's application-fee revenue.

Net effective margin on a $40 order with 15% fee:
- Application fee: $6.00
- Less Stripe processing: ~$1.46 (2.9% × $40 + $0.30)
- Less Stripe Connect per-transfer (assume 2 transfers): ~$0.50
- Less Stripe Tax: ~$0.20
- = ~$3.84 net before platform costs (hosting, payroll, etc.)

Numbers will shift as scale grows. Build the model with assumptions visible.

---

## Decision 7 — Stripe products: V1 vs. V1.5

### V1

- **Stripe Checkout** (not Elements). Hosted, low PCI scope (SAQ-A).
- **Stripe Connect Express** for all payouts.
- **Stripe Tax** for sales tax.
- **Stripe Radar** (default — fraud protection, no extra setup).
- **Stripe Webhooks** for `payment_intent.succeeded`, `charge.refunded`, `charge.dispute.created`, `account.updated`.

### V1.5+

- **Stripe Billing** for Subscribe & Save (recurring orders, dunning, invoicing). Requires consumer-facing customer accounts, which V1 doesn't have.
- **Stripe Elements** if we want to embed checkout in the storefront for design control. Migrate when V1 checkout proves a conversion bottleneck.
- **Stripe Issuing** (?) if we ever issue cards to creators for spending platform credit. Unlikely in V2.
- **Stripe Identity** for enhanced KYC on high-volume creators when we offer the pass-through merchant model.

### Why Checkout (not Elements) in V1

PCI scope. Checkout is SAQ-A — Stripe owns the entire flow, our servers never see card data. Elements is SAQ-A-EP — we serve the page that hosts the card field, so we're in scope for content security policy, iframe integrity, etc.

For V1, PCI scope is overhead we don't need. Checkout's hosted page can be reasonably themed (color, logo, font), and Stripe's checkout conversion is well-optimized.

---

## V1 implementation checklist (Week 8 per roadmap)

- [ ] Add Charge, Transfer, Refund, Dispute, PlatformFeeConfig, PartnerClawback models to schema port.
- [ ] Update User schema: `stripeAccountId`, `stripeAccountStatus`.
- [ ] Set up Stripe Connect application (platform Stripe account).
- [ ] Implement `accountLinks.create` flow in `apps/creator` and `apps/partner` onboarding.
- [ ] Implement Stripe Checkout integration in `apps/storefront`.
- [ ] Implement webhook handler in `apps/api` for `payment_intent.succeeded`, `account.updated`, `charge.refunded`, `charge.dispute.*`, `transfer.*`.
- [ ] Implement Transfer scheduler (BullMQ job): wakes every 5 min, advances PENDING → READY → EXECUTING → COMPLETED.
- [ ] Implement refund flow in admin (V1.5+: consumer-self-serve in storefront).
- [ ] Configure Stripe Tax in dashboard for US-only nexus.
- [ ] Configure dynamic statement descriptors.
- [ ] Test mode: end-to-end happy path (charge → fulfillment events → transfers → payout cycle).
- [ ] Test mode: refund (full + partial) + chargeback.

---

## Open questions

1. **Final V1 fee rate?** Recommendation: 15% baseline. Confirm.

2. **Returns window — 14 days, 30 days, or per-creator?** Recommendation: **14 days default, creator can override up to 30**. Affects when Creator payout transfers execute.

3. **Pre-fund the platform Stripe balance, or rely on cash float from orders?** Recommendation: **rely on cash float for V1** (no pre-funding). Add a working-capital line of credit when monthly GMV justifies it (~$100K/mo).

4. **How do we handle a manufacturer that fulfills late (past the 7-day SLA)?** Recommendation: V1 doesn't penalize automatically. Admin notifies them. V1.5 adds an SLA-credit model where late fulfillment shifts $X from manufacturer's transfer to creator's transfer.

5. **What happens to the platform fee on a partial refund?** Recommendation: pro-rated — refund 50% of order → refund 50% of platform fee too. Standard practice.

6. **Currency support — USD only V1?** Recommendation: **USD only**. Multi-currency requires Stripe Multi-currency pricing + per-jurisdiction tax setup; punt to V2 along with multi-jurisdiction compliance.

7. **Stripe Treasury / FBO accounts?** Not in V1. Becomes interesting at V2+ scale if we want to hold creator balances longer than payouts allow.
