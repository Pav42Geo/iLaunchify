# Manufacturer Merit Engine — end-to-end summary (MM-1 → MM-7)

**Built 2026-07-06 (Cowork).** Status: code-complete + typechecking against the migrated client;
**runs in shadow mode** — standing is computed and shown but changes no real fee until the platform
flips `MeritPolicy.enabled`. Full spec: `docs/MANUFACTURER_MERIT_ENGINE.md`; build ledger:
`docs/MANUFACTURER_MERIT_CHECKLIST.md`.

## What it is
A fair, multi-signal way to judge manufacturers on more than one rating, turn that into a **badge**
(Verified → Trusted → Premier), and let the badge unlock a **lower platform fee** (locked curve:
**4.5% / 2.5% / 0%**, admin-tunable). Everyone starts equal (Verified, standard fee) and earns up.
The platform never stamps anyone "bad," and manufacturers can contest ratings they think are unfair.

## The pieces

- **MM-1 — Engine (pure).** `packages/orders/merit.ts`: four pillars — Craft 40 / Reliability 30 /
  Contribution 20 / Standing 10 — scored peer-relative, rate-based (per-100-orders), log-scaled for
  contribution, with hysteresis (promote only when sustained, demote one rung after a longer miss,
  never during grace). New shops sit neutral, not zero. Badge = `PartnerTier`. Fully unit-tested.
- **MM-2 — Nightly sweep (shadow).** `apps/admin/lib/merit-worker.ts` cron writes a
  `PartnerMeritSnapshot` per manufacturer and logs the badge recommendation — but never changes a tier
  or fee. This is the safety rail: watch the model against reality before it touches money.
- **MM-3 — Admin console.** `/merit` (under Settings → after Tiers & Plans): KPI strip, per-manufacturer
  standing table, a policy editor, and a dry-run simulator that re-scores stored pillars under a
  candidate policy without recomputing.
- **MM-4 — Fairness / appeals.** Pure appeal FSM + SLA + "freeze standing while open." Manufacturers
  file appeals; admins **uphold / exclude / re-attribute**; an excluded rating drops from the aggregate
  through one shared recompute writer (`recomputePartnerRatingAggregate`). Admin inbox at
  `/merit/appeals` with ack/resolve SLA badges.
- **MM-5 — Badge → fee (shadow-safe).** `resolveManufacturerFeeBps` returns the base fee unchanged
  while the engine is off; resolves from the badge when live. Reversible with no migration. The console
  previews each manufacturer's "fee now → if live."
- **MM-6 — Manufacturer-facing.** Partner `/standing` page: badge (labeled projection while shadow),
  pillar breakdown with weights, "path to the next badge," the fee ladder, a **Contest** entry on
  recent ratings, and a "How it works" manual (modal + branded PDF). Honest by design.
- **MM-7 — Fee grace & promotions.** Admin can skip the merit fee for a window at an editable %:
  a **global toggle** (duration in **days or months** from activation, live-computed) and **manual
  grants** (searchable multi-select of manufacturers, %, duration, revoke). Precedence: manual grant →
  global grace → badge fee → base. Badge stays Verified — they skip the fee, not the scoring. The
  partner sees a "fee grace active through <date>" banner, and a one-time notification fires when a
  grant starts (welcome copy on global-grace activation). Once-per-grant, never a nagging countdown.

## Data + audit
New models: `MeritPolicy` (singleton), `PartnerMeritSnapshot`, `RatingAppeal`, `ManufacturerFeeGrant`;
`PartnerRating.excludedAt`, `Partner.activatedAt`, and `NotificationEvent.MANUFACTURER_FEE_GRANT_STARTED`.
Every admin write is audit-logged; every fee number is admin-configurable (no hardcoded pricing).

## Open items (all yours — decisions/ops, not code)
1. **Confirm Stripe fee incidence** (platform bears the `application_fee`, not the manufacturer) before
   wiring `computeApplicationFee` into checkout.
2. **Appeal SLA numbers** (default ack 2d / resolve 7d) + adjudicator capability (currently `reviews:write`).
3. **Flip `MeritPolicy.enabled`** to take badge→fee live, after a shadow period + simulator review.
4. **Legal:** the Partner-Agreement / ToS / Creator-Agreement recommendations for fees-by-standing,
   ratings, appeals, and promo grace are recorded in `docs/legal/LEGAL_DOCS_REDLINE_RECOMMENDATIONS.md`
   (§"Merit Engine") — a **material change → re-consent** before fee-by-standing goes live. Counsel
   translates; the `.docx` contracts were intentionally not edited.
5. **Migration:** the MM-7 notification enum needs `db:push` + `db:generate` (the sandbox couldn't
   fetch the Prisma engine to regenerate).
