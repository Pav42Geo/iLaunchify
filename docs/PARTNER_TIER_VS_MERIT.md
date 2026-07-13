# Decision: Partner tier plans vs. the Merit Engine

**Status: ADOPTED (C) — building in slices, 2026-07-06 (Cowork).** Captured + chosen same day.

## Build progress (option C)

- [x] **PT-1 — Retire the duplicate decider.** The partner tier page
  (`tiers/partner/[id]`) no longer runs `promotion-criteria.ts`; it shows the **Merit-computed** path
  to the next badge (latest `PartnerMeritSnapshot`: current → qualified badge, score, gaps) with a
  link to the Merit console, and reframes the hand-set tier editor as an **admin override**.
  `promotion-criteria.ts` + `PromotionCriteriaCard` marked DEPRECATED (unused; safe to delete later).
- [x] **PT-2 — Reframe partner plan cards** (`PlansTab`): PARTNER cards now show the **Merit
  commission** by badge (from `MeritPolicy.feeBpsByBadge`, tierOrder 0/1/2 → Verified/Trusted/Premier),
  an "Earned by standing" chip instead of a monthly price, and the features relabeled "Perks unlocked."
  Section subtitle states tiers are earned, not purchased. Creator cards unchanged.
- [x] **PT-3 — Merit fee authoritative.** Confirmed checkout never reads the partner plan `FeeRule` —
  the live production fee already flows OrderSettings → `resolveOrderProductionFeeBps` (badge/promo).
  Added an info banner on the partner plan editor (`/tiers/plan/[code]`) stating pricing + fee rules
  are **not** the live source for partner tiers (edit the badge fee in the Merit console); perks are
  what the earned badge unlocks. No fee-path code change needed.
- [x] **PT-4 — Perk enforcement — REVERTED (Pavel 2026-07-07).** A listing-cap gate was briefly wired,
  then pulled: **manufacturers list freely regardless of badge; only the FEE scales with standing.**
  The `checkListingCapacity` guard + `apps/partner/lib/listing-cap.ts` were removed (stray untracked
  file may remain on disk — delete locally). The seeded `max_active_listings` perk (3/25/∞) is now
  inert. Replaced by the **new perk model** below.
- [x] **PT-5 — Docs.** CLAUDE.md §Tiers updated (supersedes "no behavioral binding"); partner tiers
  earned via Merit, creator plans stay paid.

---

## New perk model (PROPOSED, 2026-07-07) — earned rewards, not paid features

Replaces the stale seeded ladder (the old 15-row `PlanFeature` set — listing caps, storage GB, seats,
AI-parser caps, etc. — was subscription-flavored and is now **inert**). Design principle: a higher
earned badge should make a manufacturer **more visible, win more of the routed work, and move faster**
— never hide quality or bypass safety. The **fee is the anchor** (already live via Merit); the rest are
visibility / work-allocation / speed rewards, each admin-tunable and each its own future enforcement slice.

| Perk | Verified | Trusted | Premier | Enforcement seam |
|---|---|---|---|---|
| **Production fee** (anchor — LIVE) | 4.5% | 2.5% | 0% | ✅ built (Merit resolver) |
| **Marketplace ranking boost** — default `/marketplace` sort weights higher badges up | none | boost | top | ✅ built 2026-07-07 (`templates.ts` buildOrderBy: default view orders by `manufacturerService.partner.tier desc` then newest; nudge only — explicit sorts pure; inert until standing diverges) |
| **Standing badge on the PDP** — anonymous "Trusted/Premier" tier under the rating stars | – | Trusted | Premier | ✅ built 2026-07-07 (PDP `RatingRow`; badge-only, no name/link — respects the "no partner identity on the card" lock, so it lives on the detail page not the card; Verified/none hidden) |
| **Featured eligibility** — curated Featured / niche-spotlight slots | – | limited | yes | needs build |
| **Routing priority weight** — tie-break nudge in rotation (NEVER overrides hard filters) | 0 | 1 | 2 | exists (routing engine) |
| **Reorder first-refusal** — repeat orders offered to the prior maker first | – | – | ✓ | needs build |
| **Expedited product review** — shorter *discretionary* admin queue (compliance gates unchanged) | standard | priority | expedited | exists (approve flow) |
| **Edit-live without full re-review** — minor edits to a live listing skip the queue | – | minor only | ✓ | exists (edit-review) |
| **Faster payout** — shorter transfer hold after SHIPPED | standard | faster | fastest | needs build (Stripe) |
| **Support SLA** | 48h | 24h | 4h | config only |
| **Priority / beta feature access** | – | – | ✓ | config only |

**Guardrails (non-negotiable):**
1. **Ranking boost is a nudge, not a takeover** — a strong new Verified shop still surfaces (mirrors the
   Merit engine keeping newcomers neutral, protecting cold-start).
2. **Never hides quality or skips safety** — a badge lifts position but can't mask a bad rating;
   "expedited review" speeds only the discretionary queue, never regulated compliance gates.
3. **All values admin-tunable**; the badge is EARNED (Merit), never purchasable.

**Highest-leverage first (have seams today):** production fee (done), marketplace ranking, visible
standing badge. Those three alone make climbing worth it (cheaper *and* more discoverable → more orders).

**Not yet built.** This is the target model; enforcement of each non-fee row is a separate opt-in slice.
Also TODO: reseed / blank the partner `PlanFeature` + `FeeRule` rows (the old 15/12/8% commission and
the inert perks) so the plan cards stop showing stale numbers.

---

## Original analysis (retained)

Related: `docs/MANUFACTURER_MERIT_ENGINE.md`, `docs/MANUFACTURER_MERIT_ENGINE_SUMMARY.md`,
`docs/PLATFORM_SPEC.md` (§Partner tier / commission), CLAUDE.md §Tiers.

## The question

Now that the Merit Engine exists, what happens to the **Partner plan cards** in
Tiers & Prices → Plans & Fees → Partner plans (and the `PromotionCriteriaCard` /
`promotion-criteria.ts` that decide how a partner moves up)? Retire them, keep them, or
turn earning a higher badge into a rewards ladder?

## The real problem: two brains, one tier

`Partner.tier` (Verified / Trusted / Premier) is a **single axis**. Three things hang off it today:

1. **Commission / fee rate** — now owned by the Merit Engine (badge → fee: 4.5% / 2.5% / 0%).
2. **Feature entitlements** — e.g. product-listing caps ("up to 3 at Verified", PLATFORM_SPEC §408).
3. **Promotion criteria** — how a partner moves up. Currently there is an *existing*
   `PromotionCriteriaCard` + `promotion-criteria.ts`, AND the Merit Engine's four pillars +
   hysteresis. **Both now steer the same tier.**

So this isn't "tier plans vs. Merit Engine." It's that the Merit Engine now decides `Partner.tier`
and its fee, while the old partner-plan machinery also claims to. The duplication is the thing to fix.

## Options

**A. Retire the partner tier concept.** Reject. The tier now carries real fee economics via Merit;
throwing it away loses the whole standing/fee ladder.

**B. Keep partner plans as a paid subscription (like creator maker/builder/agency).** Reject. The
Merit thesis is that standing reflects *performance*. If a manufacturer can **buy** Premier and its
0% fee, a mediocre shop pays nothing and the badge signal is worthless. A merit badge must never be
purchasable.

**C. (Recommended) Earned rewards ladder — one brain (Merit), tier = perks, never a purchase.**
- The badge stays **earned**, decided solely by the Merit Engine.
- **Retire the duplicate decider:** the Merit pillars + hysteresis *are* the promotion criteria.
  Remove `promotion-criteria.ts` / `PromotionCriteriaCard` as a second decider, or reduce them to a
  read-only pointer to the merit console. Single source of truth.
- **Repurpose the plan cards** from "buy this plan" → "what each earned badge unlocks": the fee rate
  (Merit-owned) **plus** admin-configurable perks as the reward for climbing —
  higher product-listing caps, a marketplace "Premier" badge / featured placement, priority in
  routing weight, custom creator rate cards (PLATFORM_SPEC §162 already floats Premier rate cards),
  etc. Presentational + earned, not purchasable.

Net: **don't retire the tier — retire the second brain and the purchase model, and turn the tier into
an earned reward ladder that the Merit Engine drives.**

## Consequences if C is chosen

- Reconcile `Partner.tier` writers: Merit auto-assignment (MM-8a) becomes the only writer once live;
  the hand-set path in `/tiers` becomes an admin *override* (audited), not a parallel system.
- Decide the perk model: a small `PartnerTierPerks` config (per badge: listing cap, routing nudge,
  marketplace badge, featured, rate-card eligibility) read wherever those features gate today.
- Update CLAUDE.md §Tiers — the "placeholder names, no behavioral binding decided yet / never write
  'Premier partner gets X'" note is **superseded**: binding is now real (fees today, perks next).
- Creator side is unaffected — creator plans (maker/builder/agency) remain a genuine paid subscription;
  only the *partner* tier moves to earned-only.

## Open sub-decisions for Pavel

1. Confirm C (earned ladder) vs. keeping any paid partner layer as a **separate** feature-subscription
   that is *not* the merit badge (a distinct axis, if a paid partner tier is ever wanted).
2. Which perks attach to Trusted / Premier, and are they admin-tunable.
3. Fate of `promotion-criteria.ts` / `PromotionCriteriaCard`: delete vs. redirect to the merit console.
4. Whether the `/tiers` partner hand-set tier stays as an emergency override once Merit goes live.

## Perk: team seats per badge (LOCKED 2026-07-13)

Team capacity is an EARNED perk on the badge ladder — never sold:
**Verified 3 · Trusted 10 · Premier unlimited** (0 = unlimited), admin-tunable
in the Merit console next to the fee ladder (`MeritPolicy.verifiedTeamSeats` /
`trustedTeamSeats` / `premierTeamSeats`).

Enforcement: `invitePartnerTeammate` counts live memberships + PENDING invites
against the badge cap. **Badge drops are GENTLE** — the asymmetry vs. creator
designer seats is deliberate: a partner teammate is operational staff running
live production queues; revoking one mid-order damages fulfillment (ours and
the creator's), not just the partner. Over-cap teams keep everyone; only NEW
invites are blocked until standing recovers. Partner-facing: the Team page
shows "X of Y seats · seats grow with your merit standing".
