# Co-Creation Monetization — Deep Research + Recommendation

**Status:** RESEARCH → recommendation for D-CC1 final · 2026-07-10 · prepared for Pavel
**Method:** 5 parallel research angles (services marketplaces, manufacturing/RFQ, CPG platforms, disintermediation/cold-start, escrow economics) → 15+ primary sources fetched → adversarial verification pass on the 12 load-bearing claims (11 verified, 1 narrowed).
**Question:** how should iLaunchify monetize the co-creation flow — which side eats the fee, how it composes with the existing creator tier fees + manufacturer merit fees, and how to implement without pain.

---

## 1. TL;DR recommendation

**Co-creation is already monetized at the end of its own funnel.** On `CLOSED_WON` the room materializes into a production `Order`, where the creator production fee (15/12/8%) and the manufacturer merit withhold (4.5/2.5/0%) apply automatically. Every fee added *before* that point taxes liquidity in exactly the phase where the feature lives or dies.

**Staged model (charge more only as value is proven):**

| Phase | Creator side | Manufacturer side |
|---|---|---|
| **V1 (now)** | Access bundled in **Builder + Agency** (Maker upsell = the monetization). No milestone take. | Pool access **free** for verified partners. Interests free, capped per tier (D-CC2). No subscription. |
| **V1.5 (post-liquidity)** | Unchanged. | **Merit fee applied to milestone releases** — same 4.5/2.5/0 ladder, same "eats the manufacturer" semantics, snapshot at funding, shadow-inert until an admin flips it (mirrors `MeritPolicy.enabled`). |
| **V2 (mature)** | Optional à-la-carte room pass for Maker tier (one-off fee) if demand exists. | Merit fee stays; premium *earned-tier perks* (more concurrent interests, earlier pool access) — never sold. |

**Revision to the provisional D-CC1:** keep the creator half (bundle into Builder/Agency — research supports it), but **drop the manufacturer pool subscription**. Supplier-pays-to-access models are the weakest archetype in the evidence (MFG.com churn, Maker's Row's $499–$2,999/mo factory tiers, gamed Alibaba Gold badges), they tax the scarce side at cold start, and a paid pool sits one step away from "selling the badge," which is locked out by the Merit Engine decision. The manufacturer side should pay **only on success**, via the merit ladder they already understand.

---

## 2. What the market does (verified numbers)

### 2.1 Services / talent marketplaces

| Platform | Supply side pays | Demand side pays | Model notes |
|---|---|---|---|
| Upwork | **variable 0–15%** per contract (May 2025; was flat 10% from 2023, sliding 20/10/5 before) + Connects lead fees ($0.15 ea, 4–16/proposal) | 5% Marketplace Fee (3% ACH) + $0.99–14.99 initiation | Milestone escrow standard; off-platform exit priced at **13.5% of annualized earnings** (24-mo non-circumvention window) |
| Fiverr | flat 20% incl. tips | 5.5% + small-order fee | Combined take ~25%+ |
| Freelancer.com | 10% or $5 | 3% or $3 at award | Client-side fee ≈ processing pass-through |
| Toptal / Catalant | 0% | opaque 25–100% markup | Platform controls price discovery |
| Contra / Braintrust | **0%** | flat 10–15% or subscription | Zero-commission challengers weaponizing supply loyalty |
| 99designs | 5–15% level-based | 5% | Contest model = free spec work; the model our spec already rejected |

### 2.2 Manufacturing / RFQ marketplaces

| Platform | Who pays | Model |
|---|---|---|
| **Xometry** | Buyer (spread) | Platform prices the job, pockets the difference — spread grew from ~20% (2020) to **35.3%** (Q4 2025). Suppliers join **free**. The only archetype that produced a public company. |
| Thomasnet | Supplier | Ad/listing subscription; 4.5% transaction fee **waived for subscribers** (fee-or-subscribe convergence) |
| Alibaba | Supplier | Gold Supplier $2–4.7k/yr, 0% commission; RFQ replies capped (10 quotes/RFQ, ~60 credits/mo) |
| MFG.com | Supplier | $2.5k–20k/yr subs → quoting fatigue, churn → retreated to pay-per-RFQ |
| Maker's Row | **Both** | Brands $39–599/mo; factories $499–2,999/mo — discovery-scarcity niche only |

### 2.3 CPG / creator platforms (closest comps)

| Platform | Who pays | Model |
|---|---|---|
| **Pietra** | Creator | Subscription ($39 / **$299**/mo) + **flat 3.5%** on all sourcing purchases (incl. shipping) |
| **Keychain** | Manufacturer | Brands/retailers **free**; manufacturer SaaS ~$5k–100k+/yr (avg ~$20k). $68M raised, >$1B/mo projects facilitated |
| **PartnerSlate** | Both, mostly mfr | Brand ≤$199/project to post; **manufacturer 3% success fee on first 12 months of production** ($150 min) — honor-system billing, enforcement leakage |
| Wonnda | Supplier | 0% commission both sides; supplier freemium subs |
| Printify/Printful | Creator (optional) | Margin embedded in COGS + subscription-for-discount ($29–39/mo) |

**Nobody has shipped milestone-protected co-creation in CPG.** GrowinCo does RFI workflow; escrow exists in freelance but not creator↔manufacturer product development. The Collaboration Room is white space — which argues for treating it as the *moat*, not the *toll booth*.

### 2.4 Which side eats the fee — the theory

- Rochet-Tirole: charge the less price-elastic side; subsidize the side that generates cross-side spillovers. Practically (Lenny, a16z): **charge the side that receives demand** — for co-creation, that's the manufacturer, who gets qualified, pre-briefed customers they could not source themselves.
- Gurley ("A Rake Too Far"): sustainable rakes are 5–20%; high rakes invite disintermediation and competitors. Our all-in ceiling is already occupied by the production fee (8–15%) + merit withhold — co-creation must NOT stack a third rake on the same dollar.
- B2B project-work tolerance: most B2B marketplaces target **8–12% at steady state** (Tidemark); per-milestone client fees exist (Freelancer 3%) but are ≈ processing pass-through.

### 2.5 Disintermediation (the "take it to email" problem)

Our shape — high-value, repeat, relationship-based, pre-contract communication required — is the *worst-case leakage profile* (Hagiu & Wright, Mgmt Science 2024). Verified findings:

- **Carrots beat sticks.** Escrow/payment protection, dispute resolution, on-platform reputation, structured workflow (our BuildObjects) outperform bans and contact-hiding. Homejoy died of stick-only (~40% of repeat business leaked).
- **Excess trust ironically increases leakage** (Gu & Zhu RCT) — once parties trust each other, only *workflow value* keeps them on-platform. The room must stay better than email forever.
- **Price the exit, don't block it:** Upwork's 13.5%-of-annualized-earnings conversion fee monetizes departure. Our analog belongs in the anti-circumvention clause counsel is already reviewing (D7 cluster / legal redlines).
- **Fees above value trigger leakage:** one study saw off-platform cancellations rise after a 15% commission was introduced. Since production runs recur (reorders!), a manufacturer facing a stacked co-creation fee + merit fee + platform dependency will be motivated to route reorder #2 off-platform. Keep the co-creation-specific take at 0 (V1) → merit-ladder-only (V1.5).

### 2.6 Escrow / milestone mechanics (Stripe Connect)

- Standard pattern verified: **one charge per milestone funding** (separate charges & transfers) → funds held on platform balance (US hold window now **up to 2 years**; other countries 90 days) → **transfer to manufacturer on approval, fee taken by netting the transfer** (not `application_fee_amount` — that's for destination charges).
- Precondition-based holds ("release when the creator approves the object") are the pattern Stripe's docs sanction. But **Stripe disclaims "escrow"** — user-facing copy must say **"milestone payment protection"**, never "escrow" (internal enum `FUNDED_ESCROW` is fine).
- FinCEN's integral-to-service exemption is real but narrow; under Connect, Stripe (licensed MSB) takes possession, so we never hold buyer money — the licensing-safe posture. Legal review still required before go-live (fits the existing D-CC4 counsel gate).
- Processing: 2.9% + 30¢ per charge → don't split milestones into micro-payments; four milestone charges per room is fine.
- Float: Upwork contractually keeps interest on held funds. Decide explicitly; default = platform keeps float, disclosed in terms (counsel item).

---

## 3. How this composes with the existing pillars (no double-charging)

The two-fee model (docs/FEE_MODEL_RECONCILIATION_SPEC_2026-07-09.md) already implements the research consensus: subscription + transaction fee on the high-WTP side (creator), success-only merit fee on the demand-receiving side (manufacturer). Co-creation slots in without new fee *kinds*:

1. **Creator:** Builder/Agency gating = subscription upsell. The Discovery/Sample/Tooling milestones the creator funds carry **no platform fee** (feeBps snapshot = 0). When the room closes won, the production order pays the normal tier fee via `resolveCreatorFeeBps` — same SSOT, no new resolver needed for V1.
2. **Manufacturer:** nothing in V1. In V1.5, apply `resolveManufacturerMeritFeeBps` to milestone **releases** exactly as it applies to dispatch payouts — same ladder, same shadow-inert gate, same snapshot pattern (`RoomMilestone.feeBps/feeCents` already exist, nullable). One new `MeritPolicy`-style admin toggle: `applyMeritFeeToMilestones`.
3. **Never:** a third fee on the production order that comes out of the room, partner pool subscriptions, paid badges, per-interest charges, or contest/spec-work mechanics.

**Guardrail:** the `check:invariants` rule from the fee reconciliation (no hardcoded platform-fee constants outside `@ilaunchify/plans`) already covers this surface — any future co-creation fee must land as a `FeeRule`/`MeritPolicy` row, admin-tunable.

## 4. Anti-pain checklist (implementation)

- **Creators:** Maker-tier users see the Brief Builder as a locked feature with an upgrade CTA (existing `/settings/plan` self-serve upgrade) — familiar pattern, no new billing surface.
- **Manufacturers:** expressing interest stays free; cap concurrent interests per partner tier (D-CC2 — Alibaba caps RFQ replies for pool hygiene, same logic). Fee changes arrive only via the merit ladder they already see in the partner app, with the same "shadow → enabled" rollout as the dispatch merit fee.
- **Milestones:** fund → hold → release-on-approval, one charge each, copy says "payment protection." Refund path = `MilestoneStatus.REFUNDED` via the existing refunds gate (blocked until Stripe verification anyway).
- **Ops:** everything admin-tunable: creator tier gate (which tiers see co-creation), interest caps, `applyMeritFeeToMilestones`, milestone fee bps override. All snapshot-at-write for legal reproducibility (operational-philosophy rule).
- **Legal (blocking, already tracked):** NDA/IP copy (D-CC4), anti-circumvention clause + float disclosure → counsel bundle with D7.

## 5. Sources (primary)

Upwork fee/conversion docs (support.upwork.com, upwork.com/pricing/client) · Fiverr fee schedule · Freelancer.com fees · Toptal/Catalant analyses · 99designs fee docs · Gurley "A Rake Too Far" (2013) · Lenny Rachitsky take-rate + marketplace series · Tidemark marketplace take rates · Rochet-Tirole "Two-Sided Markets" (2004) · Hagiu & Wright "Marketplace Leakage" (Mgmt Science 2024) + Platform Chronicles · Gu & Zhu "Trust and Disintermediation" (Mgmt Science 2021) · Homejoy postmortems (Backchannel/HBS) · Xometry Q4 2025 investor release + Bowery Capital S-1 teardown · Thomasnet help center + programs · Alibaba seller pricing · MFG.com history · makersrow.com/pricing · Pietra help center (fees, tiers) · Keychain PR/AlleyWatch/Irish Times · PartnerSlate MSA + help center · Wonnda supplier pages · Printify/Printful pricing · Stripe docs (separate charges & transfers, manual payouts/holding funds, destination charges, pricing) · FinCEN administrative ruling on escrow-like services.

*Verification notes: Pietra Business tier corrected to $299/mo; Freelancer's 3% is charged at award, not per-milestone; SC&T fee is netted at transfer; FinCEN exemption is fact-specific — counsel confirms, we don't self-certify.*
