# Admin Finance console — sidebar proposal

> **DECIDED (Pavel 2026-06-22):** (1) Finance group **nested inside Settings**
> (not top-level); (2) capability split approved; (3) item set approved; (4)
> the old `Settings → Billing & Subscription` placeholder **dropped**. Wired in
> `sidebar-config.ts` v3.2; **Payouts & transfers** built first (`/finance/payouts`,
> `billing:read`). Remaining items stay `hiddenUntilBuilt` until built.


The admin sidebar tree is LOCKED (`ilaunchify-admin-sidebar-v3-locked`), so this is a
**proposal**, not an applied change. It adds one new top-level group, `Finance`, to
host the admin-side billing/accounting console from `docs/BILLING_AND_ACCOUNTING.md §4`.
Nothing below is wired until you approve the tree.

---

## 1. Where it goes

A **new top-level group `Finance`** in the PRIMARY region, placed **immediately after
`Orders`** (between the `Orders` item and the promoted `Products` item, ~line 167 of
`apps/admin/src/components/nav/sidebar-config.ts`).

Rationale: Finance is *operational financial data* (ledgers, reporting), a sibling to
Orders — not configuration. Keeping it out of `Settings` preserves the rule that
Settings holds config, not records.

## 2. The exact group block (drop-in)

```ts
{
  kind: 'group',
  label: 'Finance',
  icon: DollarSign,
  children: [
    { kind: 'item', label: 'Overview',            icon: LineChart, href: '/finance',            capability: 'billing:read',     hiddenUntilBuilt: true },
    { kind: 'item', label: 'Invoices',            icon: FileText,  href: '/finance/invoices',   capability: 'billing:read',     hiddenUntilBuilt: true },
    { kind: 'item', label: 'Payouts & transfers', icon: Wallet,    href: '/finance/payouts',    capability: 'billing:read',     hiddenUntilBuilt: true },
    { kind: 'item', label: 'Refunds',             icon: RotateCcw, href: '/finance/refunds',    capability: 'refunds:approve',  hiddenUntilBuilt: true },
    { kind: 'item', label: 'Tax forms (1099)',    icon: Landmark,  href: '/finance/tax-forms',  capability: 'billing:read',     hiddenUntilBuilt: true },
  ],
},
```

Every item starts `hiddenUntilBuilt: true` and I flip each to `false` in the same PR
that ships its page — so the group only appears once it has at least one real,
permitted destination (matches the "hide until built" rule).

## 3. New icon imports

Two icons aren't imported yet; add to the existing `lucide-react` import block:

```ts
Wallet, Landmark,
```

(`DollarSign`, `LineChart`, `FileText`, `RotateCcw` are already imported.)

## 4. Capability gating (reuses existing capabilities — none invented)

| Page | Capability | Why |
|---|---|---|
| Overview, Invoices, Payouts, Tax forms | `billing:read` | Read-only finance views. The code already describes `billing:read` as "answer payout questions, never change config" — exactly this. |
| Refunds | `refunds:approve` | Refund *records* view; any actual refund stays behind `refunds:execute` + the `STRIPE_REFUNDS_ENABLED` flag. |

The sidebar `capability` is UX-only; each page keeps its own `requireCapability` as the
real fence (per the RBAC model). With the role presets, this surfaces Finance to
Super Admin and Billing-role admins, and hides it from Agent/Lead presets.

## 5. What each page is (and is NOT) — avoids duplicating locked items

- **Overview** — reconciliation dashboard: platform fee earned vs transferred vs
  refunded for a period, KPI strip. Read-only.
- **Invoices** — every creator invoice (mirror of Stripe invoices + our `Charge`
  data), filterable by tenant/status/date; row links to the Stripe-hosted PDF.
- **Payouts & transfers** — the partner payout ledger from the existing `Transfer` /
  `Payout` models: pending vs paid, failures; reconcile against
  `Charge.applicationFeeCents`.
- **Refunds** — the `Refund` ledger (money view). Distinct from **Inbox → Refund
  requests / Cancellation requests / Disputes**, which are *action queues*; Finance →
  Refunds is the *record/reporting* lens. Cross-linked, not duplicated.
- **Tax forms (1099)** — per-partner 1099 filing status for a year, who's missing tax
  info, totals. Reads from Stripe Connect Tax Forms + our `TaxDocument` pointers.

**Not affected / not duplicated:**
- `Settings → Billing & Subscription` (`/billing`, still `hiddenUntilBuilt`) is the
  *platform's own* subscription (what iLaunchify pays for its tools) — a different
  thing from this Finance ops console. Suggest (optional, your call) renaming it later
  to **"Platform subscription"** to remove the ambiguity. Left untouched here.
- `Settings → Order Settings → Fees & Commissions` is *config* (the rates). Finance is
  the *actuals* (what was charged/paid). They stay separate.

## 6. Badges — recommend none for V1

I'm **not** proposing a new `BadgeKey`. A "failed payouts" counter
(`finance.failedPayouts` = count of `FAILED` transfers) is the obvious candidate if you
want one later, but it's additive and easy to add after the pages exist. Disputes /
cancellations already carry their own Inbox badges.

## 7. Build order once approved (maps to BILLING_AND_ACCOUNTING.md §4)

1. **Payouts & transfers** — pure read over existing `Transfer`/`Charge`; highest value,
   zero new schema. Flip its `hiddenUntilBuilt` → false.
2. **Refunds** — read over existing `Refund` model.
3. **Invoices** — needs the creator-invoice mirror (overlaps billing slice 3 follow-on).
4. **Tax forms (1099)** — reads `TaxDocument` + Stripe; meaningful once Stripe Connect
   Tax Forms is enabled.
5. **Overview** — reconciliation, last (depends on the others' queries).

All on the locked v2 admin surface (cream hero + KPI strip + filter chips + sortable
table), read-mostly, deep-linking to the Stripe dashboard for any money mutation.

---

## Decisions I need from you

1. **Approve the `Finance` top-level group** placed after `Orders`? (vs. nesting it
   inside `Settings`.)
2. **Capability split OK?** (`billing:read` for views, `refunds:approve` for Refunds.)
3. **Item set OK** (Overview / Invoices / Payouts & transfers / Refunds / Tax forms),
   or add/drop any?
4. Optional: rename the existing `Settings → Billing & Subscription` to
   **"Platform subscription"** to disambiguate — yes / leave it?

Once you say go, I'll wire the group + build **Payouts & transfers** first (no new
schema), flipping just that item visible.
