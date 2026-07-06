# Manufacturer Merit Engine — audit + execution plan

**Date:** 2026-07-06. Companion to `docs/FEEDBACK_MODULE.md` (the rating engine this consumes),
`docs/PLATFORM_SPEC.md` §Tier 1 (the tier→benefit table this finally wires), and
`docs/REVIEW_ATTRIBUTION_MODEL.md` (the fairness layer that keeps a partner's execution gripe off
the product star). Treat this like routing/money work: badges bind to commission, so fairness and
appeal are load-bearing, not nice-to-have.

## The ask (Pavel, 2026-07-06)

Make manufacturer standing **earned and smart**, not hand-assigned. The highest badge should make
orders cheaper (top tier → free of platform fee); low-standing manufacturers pay more. But judge
**fairly** — a manufacturer running 100 orders can pick up a few bad scores yet still bring the
platform volume and revenue, so raw average rating alone is unjust. Fold in order volume, product
count, reliability, and contribution. Everyone **starts equal** (entry badge, standard fee) and
earns up. Badges (Verified → Trusted → Premier) are the visible layer and unlock the tier benefits.
The platform must **never auto-stamp a manufacturer "BAD"**, and must have a fair way to handle the
disputes manufacturers WILL open when they feel a rating misjudged them.

---

## Part 1 — Audit: how manufacturers are gated today

### 1.1 Tiers exist, but they're a hand-set label — not earned
- `PartnerTier` enum = `VERIFIED | TRUSTED | PREMIER`; `Partner.tier` defaults to `VERIFIED`
  (the entry rung). Names are LOCKED (CLAUDE.md, PLATFORM_SPEC §Tier 1).
- Tier is assigned **manually by an admin** — `changePartnerTier` (`/admin/tiers`) and the partner
  detail action. Nothing computes it from performance. There is **no merit engine**.
- It surfaces as an **info-only chip** on admin product/partner detail (`PARTNER_TIER_NOTE`). Per
  CLAUDE.md the rule to date has been *"no behavioral binding decided yet… never write 'Premier
  gets X'."* This plan is the decision to change that.

### 1.2 The benefit table is SPEC'd but NOT wired
`PLATFORM_SPEC.md` §Tier 1 already defines the intended binding:

| Partner tier | Marketplace commission | Routing position | "Premier" listing badge |
|---|---|---|---|
| Verified (entry) | 15% | after Trusted + Premier | — |
| Trusted (proven) | 12% | before Verified | — |
| Premier (top) | 8% | first-look | ✓ |

None of this is implemented. The production fee is **flat** — `OrderSettings.productionFeeBps`,
one rate for everyone. `OrderSettingsOverride` supports scoped overrides but only for
`CREATOR_TIER | MARKET | REGION` — **not partner tier**. Routing (SR-1..4) ranks printers/FCs by
rating and policy; the manufacturer leg is owner-pinned and does **not** consult `Partner.tier`.
So the "cheaper orders for higher tier" idea exists on paper only.

*(Some unrelated tier plumbing does exist — `partnerTierToPlanCode`, `designAlternateCap(tier)` —
but those tie tier to a subscription-plan code / feature caps, not to per-order economics.)*

### 1.3 Ratings exist — and are already partly fair — but don't drive standing
- `packages/orders/partner-rating.ts`: **Bayesian** aggregate `(C·prior + Σ)/(C + n)`, `C=10`,
  cold-start prior `3.75`, `MIN_RATINGS_FOR_DISPLAY=3` (below that: "New", never stars). This is
  the single most important fairness fact we already have: **a manufacturer with 3 reviews is
  pulled toward the platform mean, and one bad review barely moves a high-volume shop** — exactly
  the "100-order manufacturer" protection Pavel wants, already in code for routing.
- Manufacturer dimensions rated: **Quality · Consistency · Speed · Communication** (verified-order
  only — a rating can't exist without a delivered dispatch).
- `REVIEW_ATTRIBUTION_MODEL` already routes an execution gripe (print/pack/FC) to the *right*
  partner as an aspect note WITHOUT smearing the product star — a real fairness primitive.
- **But**: ratings drive marketplace display + routing rank only. They do **not** set the badge/
  tier, and there is **no** volume/reliability/contribution signal in standing at all.

### 1.4 Raw signals we ALREADY capture (the engine's fuel — nothing new to instrument)
- **Throughput/contribution:** order count, product/template count, `PartnerCapacityLedger`
  (committed/completed units), GMV via Charges.
- **Reliability:** dispatch `productionStartedAt → readyAt` vs quoted lead (on-time %),
  `DispatchDeclineReason`, `PartnerStrike` (cancellation strikes), `OrderDispute`.
- **Quality/CX:** the 4 rating dimensions + verified creator reviews.
- **Tenure:** partner `createdAt`, activation date.

### 1.5 The gaps this plan closes
1. Standing is **manual, not earned** (no engine).
2. Standing is **rating-only in spirit** — no volume/reliability/contribution → the exact
   unfairness Pavel flags.
3. The tier→benefit binding (commission/routing/badge) is **unwired**.
4. No **appeal/dispute** path for a manufacturer who was misjudged; no policy to **exclude
   out-of-their-control** defects.
5. No **manufacturer-facing** view of "where do I stand and how do I level up."

---

## Part 2 — What good marketplaces do (research → principles)

Distilled from Etsy Star Seller, Fiverr Seller Levels / Success Score, and Upwork Job Success Score
(sources at the end):

- **Multi-signal, not one number.** Fiverr scores on six metrics (rating, response rate, orders,
  unique clients, earnings, success score) and you must clear *all* thresholds — a 4.9 rating alone
  doesn't level you up. Take-away: standing = a **basket** of signals, not average stars.
- **Peer-relative is fairer than absolute.** Fiverr benchmarks a seller against others *in the same
  price range*; Upwork's JSS is relative to similar work. Take-away: judge a manufacturer against
  **its own category/format cohort**, not a single platform-wide bar (a low-MOQ digital shop and a
  high-MOQ co-packer shouldn't meet the same absolute number).
- **Volume resilience is the known fault line.** The loudest Etsy criticism is that *"large-volume
  shops are more resilient to a bad review than small-volume shops"* — and that a **4-star (still
  positive!) review** can cost the badge. Our Bayesian smoothing already fixes the first; our design
  must never treat "good but not perfect" as failure.
- **Rolling window, but not a knife-edge.** Etsy uses a rolling 3-month review; the pain is the
  hard 95% cliffs. Take-away: trailing window **with smoothing + hysteresis**, never a single
  metric flipping standing overnight.
- **Protect against out-of-scope factors.** Etsy sellers rightly resent losing standing for carrier
  delays or tracking gaps they can't control. Take-away: **exclude platform/logistics/creator-caused
  defects** from a manufacturer's score (we can, because attribution already tags cause).
- **Badges are carrots, not sticks.** Every one of these programs gives a *positive* badge to earn;
  none stamps a public "bad seller" mark. Take-away (and Pavel's explicit rule): **only positive
  badges, never a negative label.** Standing below entry just means "no badge yet / entry badge,"
  never "BAD."

---

## Part 3 — The Merit Engine (design)

### 3.1 One fair score → a badge → benefits
```
signals (rating + reliability + contribution + tenure)
   → MeritScore (0–100, peer-relative, smoothed)
   → Badge (Verified entry → Trusted → Premier)      [the visible, earned layer]
   → Benefits (commission %, routing position, listing badge)   [what the badge unlocks]
```
`Partner.tier` STAYS the source of truth for the badge (no new enum) — the engine just stops it
being hand-set and starts *earning* it. Everyone starts `VERIFIED` at the standard fee.

### 3.2 MeritScore — the basket (all rate-based, never raw counts)
Weighted blend of four pillars, each 0–100, **admin-tunable weights** (LogisticsSetting/OrderSettings
pattern — never hardcoded):

1. **Craft (default 40%)** — the Bayesian rating (quality/consistency/speed/communication).
   Smoothed, so low volume ≠ volatile. This is "are they good."
2. **Reliability (default 30%)** — on-time rate (`productionStartedAt→readyAt` vs quoted), accept
   rate (inverse of un-forced declines), **defect rate per 100 orders** (attributed disputes/
   reprints/strikes) — **rates, not totals**, so a 100-order shop with 3 issues (3%) beats a
   10-order shop with 2 issues (20%). This pillar is the direct answer to "judge volume fairly."
3. **Contribution (default 20%)** — throughput and breadth: completed-order volume, product/format
   breadth, fulfilled capacity. This is where the "they bring resources and money" fairness lives —
   **explicitly rewarded**, log-scaled so it recognizes scale without letting the biggest shop buy
   its way past bad craft. Capped so it can lift standing but never fully mask a craft failure.
4. **Standing/tenure (default 10%)** — verified longevity + clean-record recency, with a **new-shop
   grace band** (see 3.4).

Peer-relative: each pillar is scored **against the manufacturer's category/format cohort** (Fiverr's
insight), so cohorts with structurally slower lead times or higher MOQs aren't punished for physics.

### 3.3 Badge thresholds (earned, with hysteresis)
- **Verified** — entry. Everyone starts here on activation. No gate beyond onboarding/verification.
- **Trusted** — MeritScore ≥ T1 **and** minimum evidence (≥ N completed orders, ≥ M months active,
  defect rate below a ceiling). "Proven," not "perfect."
- **Premier** — MeritScore ≥ T2 **and** stronger evidence + a clean recent dispute record.
- **Hysteresis / anti-yo-yo:** promotion needs the threshold sustained over a trailing window;
  demotion needs it *missed* over a (longer) window + a warning notification first. One bad month
  never demotes. This is the Etsy-cliff fix.
- All thresholds/weights/windows are admin settings with a **preview simulator** (reuse the routing
  center's dry-run pattern: "with these weights, X shops would be Trusted, Y Premier").

### 3.4 Cold-start & small-volume fairness (the core of the ask)
- Below `MIN_RATINGS_FOR_DISPLAY` (3) the Craft pillar uses the Bayesian prior — a new shop sits at
  the neutral platform mean, not at zero. **New = unproven, never bad.**
- Contribution and Reliability use **rates with a confidence floor**: with too few orders, the pillar
  is pulled toward the cohort median (same Bayesian idea, applied to ops metrics) so a 4-order shop
  isn't ranked on noise.
- A **grace window** on activation (e.g. first 60 days / first N orders): a manufacturer can't be
  *demoted* during grace, only promoted.

### 3.5 Badge → benefits binding (the money — needs Pavel sign-off, Part 6)
Wire PLATFORM_SPEC §Tier 1 for real:
- **Commission by badge** — resolve the manufacturer's platform commission from their badge instead
  of a flat rate. **Recommended low curve (Part 6): Verified 4.5% / Trusted 2.5% / Premier 0%** —
  the PLATFORM_SPEC's old 15/12/8 is superseded (that reflected a demand-side model; the market norm
  for the *supply* side is ~0%, so we stay tiny and shrink to free at the top). Implemented as a
  partner-tier scope on the existing OrderSettings override mechanism — admin-tunable, auditable.
- **Routing position** — the manufacturer scorer (`scoring.ts`) gets an optional tier nudge
  (first-look for Premier), gated + weighted like every other routing knob, never a hard override of
  capability filters.
- **Listing badge** — Premier shows the badge on marketplace surfaces; Verified/Trusted are
  admin/partner-visible standing, not a scarlet letter.

### 3.6 What the platform NEVER does
- Never a public "BAD/poor" label. Absence of a higher badge is silent.
- Never demote on a single rating, a 4-star review, or an out-of-scope defect.
- Never let raw star average alone decide standing (that's the whole point).

---

## Part 4 — Fairness safeguards (how we "judge fair")

1. **Bayesian everywhere** — craft *and* ops rates shrink toward the cohort mean at low volume;
   high-volume shops are stable by construction (one bad order barely moves them).
2. **Rate, not count** — every reliability metric is per-100-orders, so scale never penalizes.
3. **Attribution exclusions** — a defect caused by the creator's art, a carrier, the platform, or
   another partner (already tagged by REVIEW_ATTRIBUTION + decline reasons) **does not count against
   the manufacturer**. This is the single biggest source of "I performed great but got dinged."
4. **Contribution credit** — volume/resources explicitly *raise* standing (Pavel's fairness point),
   capped so craft still matters.
5. **Hysteresis + warning-before-demotion** — standing is sticky; a manufacturer always gets a
   heads-up and a window to recover before losing a badge.
6. **Peer-relative cohorts** — judged against like manufacturers, not one universal bar.
7. **Transparency** — the manufacturer sees their pillar breakdown ("Craft 82, Reliability 74,
   Contribution 90, Standing 60 → Trusted; to reach Premier: lift on-time from 91%→95%"). Opacity is
   what breeds disputes; a clear "why + how to improve" prevents most of them.

---

## Part 5 — Disputes & appeals (what Pavel asked us to solve)

Manufacturers WILL contest ratings/defects. We resolve it fairly and cheaply:

### 5.1 Prevent first (kills ~most disputes before they open)
- Transparent pillar breakdown + "how to level up" (5.7 above).
- Attribution exclusions mean the misattributed hits never land in the first place.
- Smoothing means one review rarely changes standing, so there's usually nothing to contest.

### 5.2 Contest a specific rating/defect (lightweight)
- On a delivered order's rating/aspect note, the manufacturer can **flag it** with a reason
  ("packaging damage was the carrier," "creator approved this proof," "wrong-item claim is a
  mis-scan"). This rides the existing **`OrderDispute` + support ticket + moderation** rails — no
  new dispute engine, a new *reason class* ("RATING_APPEAL").
- Flagged rating is **provisionally held out of the aggregate** pending review if it's the kind that
  could move standing (guardrailed so this can't be abused to null every bad review).

### 5.3 Adjudication (admin, SLA'd)
- Admin reviews evidence (order timeline, proof approvals, dispatch timestamps, attribution) and
  either **upholds, excludes, or re-attributes** the rating. Excluded/re-attributed ratings are
  removed from the manufacturer's aggregate and logged (audit) — the same recompute path the rating
  engine already uses for late/edited ratings.
- **SLA:** appeal acknowledged in X business days, resolved in Y; standing frozen (no demotion)
  while an appeal that could affect it is open.

### 5.4 Systemic protection
- If a manufacturer's demotion would be driven by a *single* disputed signal, the engine **defers
  the demotion** until the dispute resolves.
- Repeated *upheld* appeals against one creator/route surface a pattern flag (possible bad-faith
  rater) into the admin Feedback/Risk view — protecting good manufacturers from a hostile counterpart.

### 5.5 Never
No public "bad" mark to dispute in the first place — appeals are about *ratings and standing*, not a
scarlet letter, which is itself the biggest dispute-reducer.

---

## Part 6 — Fee model: what competitors charge the SUPPLY side (research 2026-07-06)

Pavel's instinct — keep the manufacturer fee as low as possible to attract supply — is strongly
supported by the market. **The near-universal norm is that production/supply platforms charge the
manufacturer/supplier ~0% commission**, and monetize elsewhere (markup, membership, or the demand
side):

| Platform | Commission to the SUPPLY side (maker/manufacturer/print shop) | How they actually monetize |
|---|---|---|
| **Printify** | **0%** — print providers get the wholesale price | Margin between provider wholesale and what the merchant pays + Premium subscription |
| **Printful** | **0%** — it's its own producer | Markup on fulfillment cost the merchant pays; no % of sales |
| **Spocket** | **0%** — suppliers get full product cost + shipping | **Retailers (demand side)** pay a subscription |
| **Supliful** | **0%** — suppliers are its private-label network | **Merchant** pays ~$39–49/mo membership |
| **Alibaba** | **0% per-sale** | Supplier **annual membership** ($2–5k) + $0–5/transaction |
| **Faire** | **~15%** on the BRAND (reorders; 15%+$10 first; ~18–22% effective) | But Faire's "brand" ≈ our **creator** (owns the end customer), not our contract manufacturer. Faire Direct (own customers) = **0%** |
| **Keychain** | **0%** to manufacturers (matchmaking/discovery layer) | Elsewhere |

Two things this tells us:
1. **Charging the manufacturer anything at all already makes us less generous than Printify/
   Printful/Spocket/Alibaba to supply** — so the fee must stay *small* and shrink hard with
   standing, or it's a reason not to join.
2. **The one platform that charges supply 15% (Faire) is charging the party that owns the customer**
   — which on iLaunchify is the *creator*, not the manufacturer. So our creator-side production fee
   can carry the platform economics, letting the manufacturer commission stay near-zero as a
   **loyalty/quality incentive** rather than a primary revenue line.

### 6.1 Recommended manufacturer merit fee (admin-controlled, tiered by badge)
The fee is the **platform's commission taken from the manufacturer's production payout** (their
margin to keep grows as they earn standing). Recommendation — a low, memorable curve:

| Badge | Manufacturer commission | Rationale |
|---|---|---|
| **Verified** (entry) | **4.5%** | Below Faire by a mile; the "cost of being new," visibly temporary |
| **Trusted** (proven) | **2.5%** | Halved — a real, felt reward for consistency |
| **Premier** (top) | **0%** (recommend true zero) | The clean story: *"earn Premier and your orders are free of platform fee."* Max loyalty; matches the Printify/Alibaba 0%-to-supply norm for your best partners |

Pavel's floated **4.5 / 2.5 / 0.5** is also fair and reasonable; the only change I'd recommend is
making Premier a **true 0%** — "free" is a far stronger recruiting and retention message than 0.5%,
the lost revenue on your *best, highest-volume* partners is marginal, and it mirrors the market's
0%-to-supply standard exactly where it matters most. Either way it is **100% admin-tunable** per
badge (no redeploy), and applies to the **platform production fee only** — never pass-through costs.

Because the manufacturer fee is intentionally tiny, the platform's primary levers stay: the
creator-side production fee (Faire's model, on the party that owns the customer), partner/creator
subscriptions (already present via `partnerTierToPlanCode`), and FC/logistics margin. Keeping
manufacturer commission low is affordable *because* those exist.

## Part 6b — Decision log

1. **Fee incidence & mechanic** — manufacturer-side commission on the production payout, platform
   fee only, tiered by badge, admin-tunable. *(MM-5 confirms today's incidence in the Stripe
   split — separate charges + `application_fee` — and introduces the per-badge resolution.)*
2. **Curve — DECIDED (recommended):** Verified **4.5%** · Trusted **2.5%** · Premier **0%**
   (Pavel: keep as low as possible; admin-controlled). Still needs Pavel's final "yes" on 0% vs
   0.5% for Premier before MM-5 touches money.
3. **Pillar weights/thresholds — ACCEPTED default:** Craft 40 / Reliability 30 / Contribution 20 /
   Standing 10, tunable via the MM-3 simulator.
4. **Windows — ACCEPTED (recommended):** promotion sustained over a trailing window; demotion only
   after a longer miss + warning; new-shop grace (≈60 days / first N orders, promote-only).
5. **Rollout — ACCEPTED (recommended):** shadow-mode first (compute badges + fees, keep the flat
   fee live, compare), then flip.
6. **Appeal SLA / adjudicator** — still open (support vs a dedicated reviewer capability); set at MM-4.

---

## Part 7 — Execution plan (phased, additive, reversible)

**MM-0 · Audit — DONE (this doc).**

**MM-1 · Merit schema + pure engine** *(CW; no behavior change)*
- `PartnerMeritSnapshot` (per manufacturer service: pillar sub-scores, MeritScore, cohort, computed
  badge, evidence counts, computedAt) + `MeritPolicy` singleton (weights, thresholds, windows,
  cohort defs — admin-tunable). Additive schema.
- Pure `computeMeritScore(signals, policy, cohortStats)` in `@ilaunchify/orders` (or a new
  `@ilaunchify/merit`), fully unit-tested (compiled-node), Bayesian + rate-based + peer-relative +
  hysteresis. No fees touched.

**MM-2 · Signal loaders + nightly badge job** *(CW)*
- Loaders over existing data (ratings, dispatch timings, declines, strikes, disputes, order/product
  counts, capacity). Nightly cron computes snapshots + proposes badge changes; **shadow-mode**
  (writes snapshot, does NOT change `Partner.tier`) until MM-5 flip. Warning-before-demotion
  notifications wired.

**MM-3 · Admin Merit console** *(CW; v2 admin surface)*
- Standing dashboard (cohorts, distribution, who'd promote/demote), per-manufacturer pillar
  breakdown, the **simulator** (tune weights/thresholds → see the resulting badge distribution before
  committing), manual override with reason (admin can still pin, audited).

**MM-4 · Fairness/appeal flow** *(CW + PAVEL policy)*
- `RATING_APPEAL` reason on the existing dispute/ticket rails, provisional hold, admin
  uphold/exclude/re-attribute → rating-aggregate recompute, standing-freeze during open appeal, SLA
  timers + notifications.

**MM-5 · Benefit binding** *(CW builds; **PAVEL money sign-off required** — Part 6)*
- Partner-tier scope on the OrderSettings override → fee resolves from badge at checkout (audited,
  reversible). Optional routing nudge for Premier. Premier listing badge on marketplace.
- Flip badge assignment from shadow → live once the simulator + a shadow period look right.

**MM-6 · Manufacturer-facing standing + the Manual** *(CW)*
- Partner dashboard "Your standing" card: current badge, pillar breakdown, "what unlocks the next
  badge," fee they're paying, appeal entry point — transparency is the top dispute-reducer.
- **"How it works" manual** for the Rate / Feedback / Review & Merit engine (modal + downloadable
  PDF, same pattern as the Routing & Rotation manual) so both admins and manufacturers understand
  exactly how standing is earned and how to contest it.

**Sequencing rule:** MM-1→4 are safe/reversible and change no economics. MM-5 is the only phase that
touches money and is gated on Pavel's Part 6 numbers. Nothing auto-labels anyone "bad" at any phase.

---

## Sources
- [Etsy — Star Seller: how it works](https://www.etsy.com/starseller) · [Star Seller requirements 2026 (Craftybase)](https://craftybase.com/blog/how-to-become-etsy-star-seller) · [Etsy Community — "unfair average score criteria"](https://community.etsy.com/t5/Technical-Issues/Star-Seller-tag-s-unfair-average-score-criteria/td-p/144938939) · [Why Star Seller is hard (Fera)](https://fera.ai/blog/posts/etsy-star-seller-program-is-unattainable)
- [Fiverr — Success score (Help Center)](https://help.fiverr.com/hc/en-us/articles/21965360854673-Success-score) · [Fiverr — freelancer levels](https://help.fiverr.com/hc/en-us/articles/360010560118-Understanding-Fiverr-s-freelancer-levels) · [Fiverr seller levels 2026 (six metrics)](https://eduearnhub.com/fiverr-seller-levels/)
- [Fiverr vs Upwork (Job Success Score context)](https://www.fiverr.com/resources/guides/business/fiverr-vs-upwork)
- **Fee benchmarking:** [Printify — Does it cost anything](https://help.printify.com/hc/en-us/articles/4483638151569-Does-Printify-cost-anything) · [Printful pricing](https://www.printful.com/pricing) · [Spocket supplier FAQs](https://www.spocket.co/supplier-faqs) · [Supliful (Shopify App Store)](https://apps.shopify.com/supliful) · [Alibaba Gold Supplier pricing](https://seller.alibaba.com/pricing) · [Faire fees explained (Brahmin)](https://www.brahmin-solutions.com/blog/what-is-faire-wholesale)
