# Billing & Accounting — architecture brief

Status: PROPOSAL for Pavel review (2026-06-22). Not yet built. Grounds the
Canva-style billing UX in the Stripe stack iLaunchify already runs
(`packages/payments`: Connect Express + Customer + Subscriptions + Checkout).

Related: `docs/PAYMENTS.md`, `docs/PAYMENTS_READINESS.md`,
`docs/SECURITY_ARCHITECTURE.md`, memory `ilaunchify-integrations-registry`.

---

## 0. The one decision that drives everything

**iLaunchify never stores a card number, CVC, or bank account number — ever, in
any environment.** Stripe holds all of it. Our database holds only opaque Stripe
IDs (`cus_…`, `pm_…`, `acct_…`, `ba_…`) plus non-secret display crumbs (brand +
last4 + exp month/year). This is not a nice-to-have; it is what collapses our PCI
burden from the nightmare tier (SAQ-D, pen-tests, audited cardholder-data
environment) to the trivial tier (**SAQ-A**), and it means a full database breach
leaks zero usable payment instruments. Every other security measure below is
secondary to this one. The Canva screenshots show a raw card form — we replicate
that **look**, but the input is a Stripe Elements iframe, so the PAN never touches
our DOM, our JS, our logs, or our servers.

---

## 1. Two money flows = two surfaces (don't conflate them)

iLaunchify moves money in two directions. They use different Stripe primitives and
must be two different screens, or the UX gets confusing fast.

| | **Billing** (money OUT) | **Earnings / Payouts** (money IN) |
|---|---|---|
| Who | Creators (and partners' subscription, if any) | Partners (and creators where applicable) |
| Pays for | Production orders, tier subscription, samples | Receiving production revenue |
| Stripe primitive | **Customer** + PaymentMethods + Invoices | **Connect Express** account + Payouts |
| Sensitive data lives in | Stripe (card on Customer) | Stripe (bank on Connect acct) |
| Our schema today | `User.stripeCustomerId`, `Charge` | `User.stripeAccountId`, `Transfer`, `Payout` enum |
| Canva analog | the screenshots you sent | n/a (Canva users don't get paid) |
| Etsy analog | "Bill" / payment account | "Payment account" + "Legal & tax" → 1099 |

The Canva screenshots are the **Billing** column. The 1099 question lives in the
**Earnings** column (you 1099 the people you *pay*, i.e. partners). Keep them on
separate left-nav items under one "Payments & plans" group, exactly like Canva
groups Billing + Orders and invoices.

---

## 2. Surfaces to build

### 2a. Billing (creator app + partner app) — the Canva clone

One shared surface, mounted in both apps, scoped to the signed-in tenant. Sections,
matching your screenshots:

- **Plan** — current tier (Maker/Builder/Agency for creators; Verified/Trusted/
  Premier info-chip for partners) + upgrade CTA. *Already exists* at
  `/settings/plan` — fold it in, don't rebuild.
- **Payment method** — add/replace card via **Stripe Elements** (or open the
  **Stripe Customer Portal** in a hosted tab — even less for us to secure). Display
  = brand + •••• last4 + expiry only. "Add" → Stripe SetupIntent; we store the
  returned `pm_…` and set it as the Customer's default.
- **Billing details** — billing contact name, billing address (tax calc), tax ID,
  additional billing-contact emails. This is plain business data, safe to store in
  our DB on a new `BillingProfile` row. Address feeds **Stripe Tax** for sales-tax
  on subscriptions/fees.
- **AI usage / metering** (Canva's middle card) — N/A for us unless you want a
  "production credits" meter later. Skip V1.

### 2b. Orders and invoices

A searchable invoice list (Canva's second screenshot, and Etsy's "Payment
account → Activity"). Columns: Description, Created on, Status, Total payable,
Actions (Download PDF / View).

**Don't generate PDFs ourselves.** Stripe already produces a hosted, audit-clean
invoice PDF for every subscription cycle and can for one-off charges too. We mirror
a lightweight `Invoice` row (id, number, date, status, total, `hosted_invoice_url`,
`invoice_pdf`) for fast listing + search, and the "Download" action just links to
the Stripe-hosted PDF. Mirror rows are populated from `invoice.*` webhooks (we
already have webhook infra + event-id dedupe).

### 2c. Earnings / Payouts (partner app, + creator if they receive)

*Partially exists* — `/settings/payouts` + `ConnectButton`. Round it out to show:
balance (available/pending, read from Stripe), payout schedule, next payout date,
payout history (from `Transfer`/`Payout`), and a "Manage payout account" button
that opens the **Stripe Express dashboard** (Stripe-hosted — bank details, KYC, and
1099s all live there, so we never render or store them).

### 2d. Tax documents (1099) — see §3.

---

## 3. 1099 annual tax documents — use Stripe Connect, don't build it

This is the Etsy model exactly: Etsy issues sellers a **1099-K** through its payment
processor. iLaunchify is the platform that pays partners, so iLaunchify is the
filer of record — and **Stripe Connect's "1099 tax forms" product files and
delivers them for us.**

**Recommendation: enable Stripe Connect Tax Forms. Do not hand-roll tax math or
filing — it's a large, recurring compliance liability with criminal-penalty
downside, and Stripe already has the TINs (collected at Connect onboarding via
W-9/W-8) and the payment totals.**

What Stripe does:
- Generates **1099-NEC** (non-employee compensation) and/or **1099-K** (payment
  transactions) per connected account.
- E-files with the **IRS and states**, mails or e-delivers to recipients, tracks
  per-state thresholds and corrections.
- Surfaces each partner's form inside their **Stripe Express dashboard**.
- Pricing (current): **$2.99/form** e-filed with IRS, **$1.49/form** with states,
  **$2.99/form** mailed; e-delivery free. Recipient deadline Jan 31; latest
  recommended file date ≈ Jan 22.

What we build (thin): a **Tax documents** section in the Earnings surface that lists
the partner's available forms and deep-links to the Stripe-hosted copy, plus an
admin view of filing status (§4). We store only a **pointer + status** per form
(`TaxDocument`: year, type, `stripe_form_id`, status, deliveredAt) — **never the TIN
and never the form numbers themselves.**

### Current thresholds (verify yearly — these moved a lot recently)

As of June 2026, the **One Big Beautiful Bill** *reverted* the 1099-K federal
threshold back to the old **$20,000 AND 200 transactions** (the planned
$2,500-for-2025 / $600-for-2026 drops were repealed). **1099-NEC** threshold rose
from $600 to **$2,000** for payments made in 2026+. **Many states still trigger at
$600** regardless of federal. Stripe tracks all of this; we should not encode
thresholds in our code — just display what Stripe issues. (Sources at end.)

### Who gets which form

Partners are paid via Connect transfers for services rendered → typically **1099-K**
(third-party network payments) is the natural fit for marketplace payouts, the same
form Etsy/Uber/DoorDash issue. Confirm 1099-K vs 1099-NEC treatment with a tax
advisor before enabling — it's a settings choice in Stripe, and the wrong one is an
annoying correction, not a catastrophe. This is the **one genuinely
lawyer/CPA-gated decision** in this whole brief.

---

## 4. Admin / ops console

All under the locked v2 admin surface (cream hero + KPI strip + filter chips +
sortable table + RowActionsMenu), read-mostly, deep-linking to the Stripe dashboard
for any actual money mutation. **We mirror Stripe for fast search + cross-referencing
to our orders/partners; we do not rebuild Stripe's dashboard.**

Pages (new `MANAGE → Finance` group, proposal — sidebar is LOCKED, so this needs your
sign-off before it lands):

- **Invoices** — every creator invoice, status, amount; filter by tenant/status/date.
- **Payouts & transfers** — partner payout ledger (`Transfer`/`Payout`), pending vs
  paid, failures; reconcile against `Charge.applicationFeeCents`.
- **Refunds & disputes** — existing `Refund`/`Dispute` models surfaced; refund stays
  flag-gated (`STRIPE_REFUNDS_ENABLED`) until the test-mode runbook passes.
- **Tax forms (1099)** — per-partner filing status for the year, who's missing tax
  info (blocks filing), totals. Pulls from Stripe; we store status only.
- **Reconciliation** — platform fee earned vs transferred vs refunded, per period.

Every row action writes an `AuditLog` entry (existing `packages/audit`).

---

## 5. Security model — defense in depth, but §0 is the foundation

Ordered by how much risk each removes:

1. **Tokenization / no PAN or bank data at rest (§0).** Stripe Elements or hosted
   Customer Portal for cards; Connect Express for bank accounts. Breach of our DB =
   zero usable instruments. PCI scope = **SAQ-A**.
2. **Tenant isolation (your threat #1).** Every billing/earnings/invoice read goes
   through the centralized ownership guards in `packages/auth` — a creator can never
   load another creator's invoice or payout. No ad-hoc `where` checks. Authz tests
   cover each new surface.
3. **Secrets stay env-only.** Stripe keys live in env (per the integrations-registry
   stance — never a DB key vault, never shown in UI). Use **restricted Stripe keys**
   scoped to the minimum resources per service. Rotation runbook already exists.
4. **Webhook integrity.** Verify Stripe signatures on every webhook; the global
   event-id dedupe table prevents replay/double-processing (already shipped).
5. **Idempotency keys** on every money-moving Stripe call (charge, refund, transfer,
   payout) so retries can't double-charge or double-pay.
6. **Step-up / re-auth for sensitive changes.** Changing a payout bank account or
   downloading a tax form happens in Stripe's hosted Express dashboard, which does
   its own re-authentication — we don't have to build it, and the bank field never
   hits us.
7. **Audit everything.** Every billing/payout/tax/refund action → `AuditLog` with
   actor, before/after, IP. Non-repudiation + forensic trail.
8. **Least-privilege admin (RBAC).** Finance pages gated behind a `finance.*`
   capability; only Billing/Super admin presets see them. Viewing ≠ mutating.
9. **No sensitive data in URLs/logs.** Never put `cus_`, `pm_`, TINs, or amounts in
   query strings; scrub Stripe IDs from analytics. Tax IDs (EIN/SSN) are **never**
   persisted by us — Stripe holds them.
10. **Transport + headers.** HTTPS only, HSTS, the security headers already added in
    all four `next.config`s; CSP allows only Stripe's JS origins for the Elements
    iframe.

Net: an attacker who fully owns our database gets order metadata and Stripe *IDs* —
not a single chargeable card, drainable bank account, or SSN. That is the design
goal, and §0 + §2 deliver it.

---

## 6. Schema delta (additive — CockroachDB `db push`, no `@db.Text`)

Already have: `User.stripeCustomerId`, `User.stripeAccountId`,
`User.stripeAccountStatus`, `Charge`, `Transfer`, `Refund`, `Dispute`, `Payout`
enum, tier-subscription handles.

Net-new (all just pointers + display crumbs — no secrets):
- `BillingProfile` — userId (or brand), billingContactName, billingAddress (JSON),
  taxId? (display string only, e.g. VAT — **not** an SSN), additionalContacts JSON.
- `PaymentMethodRef` — userId, `stripePaymentMethodId`, brand, last4, expMonth,
  expYear, isDefault. (Display mirror; Stripe is source of truth.)
- `Invoice` — userId, `stripeInvoiceId`, number, periodStart/End, amountDueCents,
  status, `hostedInvoiceUrl`, `invoicePdf`. (Webhook-fed mirror.)
- `TaxDocument` — userId, year, type (`FORM_1099K | FORM_1099NEC`),
  `stripeFormId`, status, deliveredAt. (Pointer only.)

No model stores a PAN, CVC, bank number, or TIN. That's the invariant.

---

## 7. Build order (when you greenlight)

1. `BillingProfile` + Billing details form (plain data, no Stripe risk) — safe warm-up.
2. Payment method via Stripe Elements/Portal + `PaymentMethodRef` mirror.
3. `Invoice` webhook mirror + Orders-and-invoices list (read-only, links to Stripe).
4. Round out Earnings/Payouts surface (Express dashboard deep-link).
5. Enable Stripe Connect Tax Forms + `TaxDocument` pointer + Tax-documents section.
6. Admin Finance console (needs sidebar sign-off — LOCKED tree).

Each slice is independently shippable and verifiable; none touches the contested
creator-canvas hot path.

---

## Sources (1099 facts — verify yearly)

- Stripe Connect 1099 product + pricing — https://stripe.com/connect/1099
- Stripe US tax reporting for Connect platforms — https://docs.stripe.com/connect/tax-reporting
- IRS FAQs, OBBBA 1099-K threshold reverts to $20,000/200 — https://www.irs.gov/newsroom/irs-issues-faqs-on-form-1099-k-threshold-under-the-one-big-beautiful-bill-dollar-limit-reverts-to-20000
- 1099-NEC $600 → $2,000 (2026+) — https://docs.stripe.com/connect/1099-NEC
