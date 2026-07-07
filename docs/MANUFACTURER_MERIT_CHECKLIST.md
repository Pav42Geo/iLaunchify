# Manufacturer Merit Engine — build checklist

Companion to `docs/MANUFACTURER_MERIT_ENGINE.md` (audit + design). Fee curve **DECIDED**:
Verified **4.5%** · Trusted **2.5%** · Premier **0%** (admin-tunable, platform-fee only).
Weights default Craft **40** / Reliability **30** / Contribution **20** / Standing **10**.

Rule of the build: **MM-1→MM-4 change no economics and are reversible. Only MM-5 touches money**
(gated). **Nothing ever auto-labels a manufacturer "bad."**

---

## MM-0 · Audit — ✅ DONE
- [x] Current gating audited (manual tiers, spec'd-unwired benefits, rating not tied to standing) —
  see MANUFACTURER_MERIT_ENGINE.md Part 1.
- [x] Competitor fee research + fair curve decided (Part 6).

## MM-1 · Merit schema + pure engine — CODE COMPLETE 2026-07-06 (CW)
- [x] Pure `computeMeritScore(signals, policy, cohort)` — 4 pillars, Bayesian-shrunk ops rates,
  cohort-relative craft/defect/contribution, contribution log-scale + breadth. `@ilaunchify/orders`.
  Badge (qualified) folded in (thresholds + evidence gates; hysteresis is the MM-2 cron's job).
- [x] `validateMeritPolicy` (weights sum 100, thresholds ordered, fee bps range).
- [x] `DEFAULT_MERIT_POLICY` carries the decided fees (450/250/0) + 40/30/20/10 weights.
- [x] Compiled-node tests (11 cases, 624/0): new = neutral-not-zero; high-volume → Premier;
  low-volume shields ops noise while high-volume is penalized; contribution can't mask craft
  failure; evidence gate; Premier defect ceiling; recent-defect standing dent; policy validation.
- [x] Schema draft (UNMIGRATED): `MeritPolicy` singleton + `PartnerMeritSnapshot` (soft-FK,
  reuses `PartnerTier` for the badge). `enabled=false` = shadow-mode.
- [x] Audit entity types: `MeritPolicy`, `PartnerMeritSnapshot`.
- [ ] **[PAVEL]** migrate (db:push + generate + .next clear) — the pure engine ships without it;
  MM-2 (loaders/cron writing snapshots) is the first consumer of the tables.

## MM-2 · Signal loaders + nightly badge job — CODE COMPLETE 2026-07-06 (CW)
- [x] `loadManufacturerMeritSignals` (merit-signals.ts) over existing data: rating (denorm),
  accept-rate (dispatch declines), defect-rate (ACTIVE strikes /100 orders), completed PRODUCT
  dispatches, product count, capacity units, tenure, clean-recency. **on-time = null in V1**
  (no promised-date field on OrderDispatch — MM-2.1 follow-up); dispute-attributed defects also
  MM-2.1 (disputes are order-level today).
- [x] `deriveCohortFromSignals` — GLOBAL cohort (batch means + median volume). Per-category
  cohorts = MM-2.1 refinement (engine already takes any cohort).
- [x] `recommendBadgeChange` (pure, hysteresis) — promote only when SUSTAINED over the window,
  demote one rung only after a longer miss, never during grace; 5 tests (one bad night never
  demotes; insufficient history holds). Full suite 629/0.
- [x] Nightly cron `apps/admin/api/cron/merit` + `runMeritSnapshotSweep` worker (CRON_SECRET,
  vercel.json `0 4 * * *`): computes + writes `PartnerMeritSnapshot` in **SHADOW-MODE** (never
  changes `Partner.tier`/fee), logs the recommendation (MERIT_BADGE_RECOMMENDED_SHADOW). Cast-
  guarded reads/writes until the MM-1 tables migrate. `MeritPolicy.enabled` is read but only
  consumed to ASSIGN at MM-5.
- [ ] Warning-before-demotion NOTIFICATIONS (`PARTNER_STANDING_*` events) — deferred to the MM-5
  flip (nothing to warn about while shadow; the recommendation is already audit-logged).
- [ ] **[PAVEL]** migrate (MM-1 tables ride here): `pnpm db:push && pnpm db:generate && rm -rf apps/*/.next`.

## MM-3 · Admin Merit console — CODE COMPLETE 2026-07-06 (CW)
- [x] `/merit` v2 surface (sidebar Users & Roles → Manufacturer standing, `billing:write`):
  KPI strip (Verified/Trusted/Premier shadow distribution w/ fee labels, would-change count,
  engine on/off) + standing table (current→qualified badge, MeritScore, pillar breakdown,
  orders, next-step gap) — latest snapshot per manufacturer.
- [x] `scoreFromPillars` shared core (computeMeritScore refactored to use it; 2 tests) — lets the
  simulator re-score STORED pillars under a candidate policy with no signal recompute.
- [x] Policy editor + **dry-run simulator**: tune weights/thresholds/evidence/fees/windows →
  "Simulate" shows the resulting badge distribution + how many change vs today's tier and vs the
  saved policy, BEFORE saving. `saveMeritPolicy` (validated + audited); weight-sum guard.
- [x] De-cast `merit-worker.ts` against the real client (tables migrated) — genuine tsc-green.
- Note: manual per-manufacturer override already exists (`/admin/tiers` changePartnerTier);
  console links standing → that flow rather than duplicating it.

## MM-4a · Fairness / appeal ENGINE — CODE COMPLETE 2026-07-06 (CW)
- [x] Pure `rating-appeal.ts`: appeal FSM (`canTransitionAppeal`/`assertAppealTransition`), SLA
  (`appealDeadlines`, `appealSlaState` ack→resolve escalation), `standingFrozen` (open appeal
  blocks demotion). 5 tests (636/0).
- [x] Schema (UNMIGRATED): `RatingAppeal` + `RatingAppealStatus` enum; `PartnerRating.excludedAt`/
  `excludedReason` (aggregate recompute will filter `excludedAt: null` → excluded rating stops
  counting without deletion). Audit type `RatingAppeal`.
- [x] Standing-freeze wired into the merit sweep — an OPEN appeal defers demotion (cast-guarded
  until migrate; inert until MM-4b creates appeals).
- [x] **[PAVEL]** migrate (RatingAppeal + PartnerRating cols) — DONE (client confirmed: 35 RatingAppeal
  refs + 28 excludedAt refs); MM-4b builds against real types, worker de-cast.

## MM-4b · Appeal actions + UI — CODE COMPLETE 2026-07-06 (CW)
- [x] Shared single writer `packages/orders/partner-rating-recompute.ts`
  (`recomputePartnerRatingAggregate`, filters `excludedAt: null`) — one source of truth for the
  rating submit path AND the appeal-exclusion path. Exported from orders index.
- [x] Admin adjudicate `merit/appeals/actions.ts`: `acknowledgeRatingAppeal` (→ UNDER_REVIEW) +
  `adjudicateRatingAppeal` (UPHELD leaves rating; EXCLUDED/REATTRIBUTED set `excludedAt`+reason in a
  tx, then recompute outside tx). FSM-guarded (`canTransitionAppeal`), `reviews:write`, audited.
- [x] Appeal inbox `merit/appeals/{data,page}.tsx` + `AppealRowActions.tsx` — v2 surface, KPI strip
  (open / ack-overdue / resolve-overdue / resolved), SLA badges (`appealSlaState`), per-row
  acknowledge + 3 outcomes. Sidebar "Rating appeals" under Users & Roles (`reviews:write`).
- [x] Partner file action `standing/actions.ts` (`fileRatingAppeal`): DENY-by-default ownership
  (rating's service via `serviceOwnedBy`), one appeal per rating (compound unique), ≥20-char reason,
  SUBMITTED + audit. Freezes standing (already wired in the sweep, MM-4a).
- [x] Verify: orders + admin + partner tsc clean; 636/0 pure suites.
- [ ] Warning + resolution notifications; bad-faith-rater pattern flag into admin Feedback/Risk
  *(deferred — needs notification event + Risk hook; not blocking the loop)*.
- [ ] **[PAVEL]** confirm SLA numbers (default ack 2d / resolve 7d, in `DEFAULT_APPEAL_SLA`) +
  adjudicator capability (using `reviews:write` — change if you want a dedicated one).
- Partner "Contest a rating" **entry point UI** lands with the "Your standing" card in **MM-6**;
  the `fileRatingAppeal` action is ready for it now.

## MM-5 · Benefit binding *(CW builds; **PAVEL money sign-off**)*
- [x] **Pure resolver** `packages/orders/merit-fee.ts` — `resolveManufacturerFeeBps({base, badge,
  policy, enabled})` → the production-fee bps for a manufacturer's leg. SHADOW-SAFE: returns the
  base OrderSettings fee unchanged while `enabled=false`; resolves from the badge (Verified 450 /
  Trusted 250 / Premier 0) when live. Reversible with no migration; unknown badge → base, never
  throws. `feeBpsToPct` helper. 6 tests (642/0). Exported from orders index.
- [x] **Fee preview** in the merit console standing table — per manufacturer "Fee now → if live"
  (base today, badge fee if the engine went live at their qualified badge; pink when it changes) +
  a header note stating the base rate while shadow. No live charging touched.
- [ ] **[PAVEL]** Confirm today's fee incidence in the Stripe split (`application_fee`). NOTE (CW
  audit): `computeApplicationFee(subtotal, rateBp)` exists + is tested in `packages/payments/fees.ts`
  but is **not yet called in the live checkout path** — the production fee isn't wired into a real
  Stripe charge anywhere today. So binding badge→fee is safe to stage; going live means (a) wiring
  `computeApplicationFee` into checkout with the badge-resolved `rateBp`, then (b) flipping
  `MeritPolicy.enabled`. Confirm the platform (not the manufacturer) bears the fee in the split.
- [ ] Wire `resolveManufacturerFeeBps` → `computeApplicationFee` rateBp at the checkout/transfer
  point (per manufacturer leg), audited *(gated on the incidence confirmation above)*.
- [ ] Optional Premier routing nudge (scoring.ts, gated) + Premier marketplace listing badge.
- [ ] Flip badge assignment shadow → live after a shadow period + simulator review.

## MM-6 · Manufacturer-facing standing + Manual *(CW)*
- [ ] Partner dashboard "Your standing" card (badge, pillar breakdown, next-badge path, fee,
  appeal entry).
- [ ] "How it works" manual for the Rate / Feedback / Review & Merit engine (modal + downloadable
  PDF, Routing-manual pattern).
