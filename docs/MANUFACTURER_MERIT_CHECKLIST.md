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

## MM-3 · Admin Merit console *(CW; v2 admin surface)*
- [ ] Standing dashboard (cohorts, distribution, would-promote/demote).
- [ ] Per-manufacturer pillar breakdown + history.
- [ ] Simulator (tune weights/thresholds → resulting badge distribution before committing).
- [ ] Manual override w/ reason (audited); policy editor.

## MM-4 · Fairness / appeal flow *(CW + PAVEL policy)*
- [ ] `RATING_APPEAL` reason on the existing dispute/ticket rails + provisional hold.
- [ ] Admin uphold / exclude / re-attribute → rating-aggregate recompute (existing path).
- [ ] Standing-freeze while an outcome-affecting appeal is open; demotion deferral.
- [ ] Appeal SLA timers + notifications; bad-faith-rater pattern flag.
- [ ] **[PAVEL]** SLA numbers + adjudicator capability.

## MM-5 · Benefit binding *(CW builds; **PAVEL money sign-off**)*
- [ ] Confirm today's fee incidence in the Stripe split (`application_fee`).
- [ ] Partner-tier scope on OrderSettings override → production fee resolves per badge
  (4.5 / 2.5 / 0%), audited + reversible.
- [ ] Optional Premier routing nudge (scoring.ts, gated) + Premier marketplace listing badge.
- [ ] Flip badge assignment shadow → live after a shadow period + simulator review.

## MM-6 · Manufacturer-facing standing + Manual *(CW)*
- [ ] Partner dashboard "Your standing" card (badge, pillar breakdown, next-badge path, fee,
  appeal entry).
- [ ] "How it works" manual for the Rate / Feedback / Review & Merit engine (modal + downloadable
  PDF, Routing-manual pattern).
