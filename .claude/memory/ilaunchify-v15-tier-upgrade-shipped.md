---
name: ilaunchify-v15-tier-upgrade-shipped
description: V1.5 creator self-serve tier upgrade (Maker → Builder/Agency) is fully shipped as of 2026-05-31. End-to-end Stripe Checkout flow + cancel_at_period_end + admin path all use the shared setCreatorTierWithAudit helper.
metadata: 
  node_type: memory
  type: project
  originSessionId: f1d70585-c159-4eab-861c-0f3599bfdeaf
---

V1.5-T1 through V1.5-T6 shipped 2026-05-31. The creator self-serve tier
upgrade flow is live. Six commits land it cleanly:

- T1 (Pavel) `adcfd89` — schema: `stripeTierSubscriptionId @unique` +
  `tierCurrentPeriodEnd` + `tierCancelAtPeriodEnd` on `CreatorProfile`.
- T2 `0a7e9cd` — `packages/auth/src/tier-writes.ts` exports
  `setCreatorTierWithAudit({creatorProfileId, newTier, actor, payload})`.
  Both admin actions in `apps/admin/.../tiers/actions.ts` and the V1.5-T4
  Stripe webhook handlers go through it. Actor discriminated union:
  `{kind:'admin', userId}` stamps `tierChangedById`; `{kind:'system'}`
  leaves it null so the admin UI can distinguish self-paid vs
  admin-promoted later.
- T3 `67b5bb8` — `packages/payments/src/tier-subscriptions.ts` exports
  `createTierCheckoutSession`, `cancelTierSubscription` (cancel_at_period_end
  pattern), `resumeTierSubscription`. Per-subscription Stripe Product +
  Price (mirrors `ProductionSubscription` pattern — grandfathers existing
  subscribers via pinned Price.id if admin changes pricing).
- T4 `ece178a` — three Stripe webhooks: `checkout.session.completed`
  (branches on metadata.ilaunchify_kind === 'tier'),
  `customer.subscription.updated` (mirrors cancel_at_period_end + period
  end onto CreatorProfile), and tier branch on
  `customer.subscription.deleted` (flips back to MAKER + clears handles).
  `invoice.payment_succeeded` deliberately untouched — the existing
  ProductionSubscription lookup-miss already short-circuits tier invoices.
- T5 `c47a2f9` — `/settings/plan` page in apps/creator with three tier
  cards. State machine per card: current+active → CancelButton; current+
  pending → ResumeButton + cancel date; upgrade → Stripe Checkout via T3;
  downgrade → explainer copy (Pavel decision V1.5: no in-app downgrade —
  must cancel + re-subscribe). Plan card on /settings landing.
- T6 `133c00a` — three upgrade entry points repointed to `/settings/plan`:
  UpgradeOverlay (Studio), orders-detail Get-product-support gate, marketing
  /pricing PricingCards (auth-aware via `isLoggedIn` prop).

**Locked decisions (Pavel V1.5):**

- Canonical URL = `/settings/plan` (NOT `/account/billing` or `/billing`).
- Monthly only — annual deferred (T3 hard-codes `interval: 'month'`).
- `cancel_at_period_end: true` cancellation — creator keeps benefits to
  period end, then customer.subscription.deleted flips back to MAKER.
- Per-subscription Stripe Product + Price (not shared lookup_key).
- Agency stays sales-touched — no in-app Checkout for top tier in V1.5.
- No in-app downgrade — Builder→Maker = cancel; Agency→Builder = cancel +
  re-subscribe manually.

**How to apply:** when extending tier-related infrastructure, route all
writes to `CreatorProfile.subscriptionTier` through `setCreatorTierWithAudit`
— never inline `prisma.creatorProfile.update({subscriptionTier})`. The
audit row + tierChangedAt + revalidation conventions live there.

See also: [[ilaunchify-subscription-tiers]] (per-tier feature gates),
[[ilaunchify-tier-model-update-2026-05-28]] (Maker unlimited + Agency
rename), [[ilaunchify-creator-team-model-v1.5]] (related but distinct —
team membership lands later).
