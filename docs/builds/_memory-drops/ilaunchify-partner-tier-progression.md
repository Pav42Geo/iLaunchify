---
name: ilaunchify-partner-tier-progression
description: Partner tier model LOCKED 2026-06-04 — Verified (free, post-onboarding) → Trusted (admin-promoted, performance-based, NO subscription V1.5) → Anchor (admin-promoted, invite-only, NO subscription). Single-dimension, narrative-arc progression. Anchor replaces "Premier" name. All three tiers free in V1.5 — no partner subscription anywhere. Subscription overlay deferred to V2 conditional on shipping advanced tools.
metadata:
  type: project
---

**Partner tier ladder — three steps with narrative meaning, all tiers FREE in V1.5:**

| Tier | Cost to partner | How to reach it | Tier means |
|---|---|---|---|
| **Verified** | $0 — only per-order fee | Pass application + KYB; go live | You arrived. Application verified, platform ready to take orders. |
| **Trusted** | $0 — only per-order fee | Admin-promoted on performance (consistent volume + reliability + on-time rate) | You earned commitment. Track record demonstrates seriousness; creators and ops trust you with bigger orders. |
| **Anchor** | $0 — only per-order fee | Admin-promoted / invite-only — top-tier scale + strategic value | You are a pillar. Earned through scale + sustained excellence + strategic importance. The supply backbone we built the business around. |

**Why no subscription anywhere in V1.5 — Pavel push-back 2026-06-04:**

The original spec staged Trusted as a paid subscription tier ($99-149/mo target) that would unlock V2 advanced tools (3D Product Builder, AI image generation, etc.). Pavel pushed back: those tools don't exist yet. Charging partners a subscription in V1.5 for tools that will only ship in V2 would be unjustifiable. Until the tools ship, every tier is free; partners pay only per-order fees.

This applies the principle from [[ilaunchify-bulk-tier-philosophy]] and [[ilaunchify-operational-philosophy-v1]] more aggressively: subscription gates features iLaunchify pays fixed cost for. If no such features exist, no subscription should exist.

**Critical design rules (V1.5 LOCKED):**

1. **All three tiers free.** Verified, Trusted, Anchor all pay only per-order fees (5% / 3.5% / 2%). No monthly subscription anywhere in V1.5.

2. **All tier progression is admin-promoted.** Verified → Trusted requires sustained performance (volume threshold + reliability score + on-time rate). Trusted → Anchor requires top-tier scale + strategic signoff. No self-serve "upgrade to Trusted" button. Tier IS earned through behavior, not purchased.

3. **Promotion criteria stays admin-tuneable.** Stored in `PartnerTierPromotionCriteria` table (existing R16.c surface). Admin can adjust thresholds as the platform learns what "Trusted-worthy" actually means in real partner data.

4. **Per-order fee differentiation stays.** Verified 5% / Trusted 3.5% / Anchor 2% — already locked in `on-demand-pricing-economics.md`. Lower fee at higher tier is the reward for promotion. No further monetary upside.

5. **Marketplace badges signal trust, not paid placement.** Anchor and Trusted badges are EARNED through admin promotion. No way to buy a badge in V1.5.

6. **Don't gate essentials behind tier.** Basic Partner Product Builder, order accept/decline, basic payouts, FDA compliance scan = always available regardless of tier. Tier only affects fee rate + marketplace placement boost + future-tool access (V2).

7. **V2 subscription overlay is OPEN, not locked.** When 3D Product Builder + AI agent + video generation ship, we revisit whether to:
   - (a) Gate advanced tools by tier — Trusted unlocks 3D Builder, Anchor unlocks AI agent. No money exchanges; tier IS the access.
   - (b) Add a separate paid "Pro tools" overlay available to ANY tier — $X/mo regardless of Verified/Trusted/Anchor status. Decouples access from trust signal.
   - (c) Revisit the original Trusted = subscription model.
   - This decision waits until tools exist + we have partner cohort data showing what they'd pay for.

**Name change Premier → Anchor stays LOCKED:**

- "Premier" felt overused (Premier Inn / League / Pro) and slightly pay-to-play
- "Anchor" captures load-bearing-supply-partner meaning
- "Anchor" works for all partner types (manufacturers, printers, co-packers, warehouses)
- Anchor partners "anchor" creator confidence + platform reliability story

**Schema implications (V1.5 — keep minimal):**

```
// EXISTING — no change needed for V1.5
PartnerTier enum — values VERIFIED / TRUSTED / PREMIER stay (UI labels Premier→Anchor)
Partner.tier — current behavior, admin-promoted via R16.b bulk action
PartnerTierPromotionCriteria — R16.c shipped; admin tunes thresholds

// DO NOT ADD in V1.5
Partner.subscriptionTier — DEFERRED to V2 if Option (b) or (c) is chosen
PartnerSubscription model — DEFERRED to V2 if needed
PartnerTierPromotion log — already covered by AuditLog for tier changes
```

**Pavel-locked decisions 2026-06-04 (FINAL):**

- ✅ Verified → Trusted → Anchor naming (Anchor replaces Premier)
- ✅ Single-dimension model (no separate achievement vs subscription tiers)
- ✅ ALL THREE tiers are free in V1.5 — no partner subscription anywhere
- ✅ Tier progression is admin-promoted at every step (Verified → Trusted = admin; Trusted → Anchor = admin)
- ✅ Per-order fee differentiation stays: 5% / 3.5% / 2%
- ✅ V2 subscription overlay is OPEN — revisit when advanced tools ship

**The principle this reinforces:**

In V1.5, every partner-side monetization mechanism must justify itself with a delivered feature that has fixed platform cost. If we haven't shipped 3D Builder, can't charge for it. If we haven't shipped AI agent, can't charge for it. Per-order fees fund variable platform cost (orchestration, support, payment processing); tier-based fee discounts reward partner performance. Subscriptions enter the picture later, when there's something to charge for.

Reference: `docs/builds/_V1.5_BULK_PRICING.md`, `docs/builds/on-demand-pricing-economics.md`, `outputs/iLaunchify_Live_Master_Model.xlsx` Partner Tiers sheet, [[ilaunchify-bulk-tier-philosophy]], [[ilaunchify-operational-philosophy-v1]], [[ilaunchify-marketplace-decisions-2026-06-01]].
