---
name: ilaunchify-bulk-tier-philosophy
description: V1.5 bulk pricing — Maker has FULL bulk access; differentiation between subscription tiers is base fee rate (15%/10%/7%), not feature lockout. Don't gate bulk behind subscription like Supliful does.
metadata:
  type: project
---

**Maker creators have FULL access to bulk orders, the full wholesale tier ladder, all decoration methods, and all MOQ levels.** Differentiation between Maker / Builder / Agency for bulk is the BASE PLATFORM FEE RATE (15% / 10% / 7%), not access lockout.

**Why:** Bulk is the primary revenue stream per Pavel's locked thesis (2026-05-26 orchestration thesis + 2026-06-04 bulk pricing lock). Gating Makers out of bulk contradicts that. Subscription gates features iLaunchify pays fixed cost for (AI parser quota, Shutterstock budget, brands per account); it does NOT gate sales mechanisms (bulk + on-demand).

**How to apply:**
- Never propose "Builder+ only" or "Agency only" gates on bulk surfaces
- Wholesale tier ladders show the same prices to all three subscription tiers
- The break-even math (5,000-unit T6 bulk: Maker pays $4,050 platform fee vs Builder $2,700 — saves $1,350/mo, Builder sub costs $79/mo, math is obvious) becomes the upgrade nudge
- Supliful gates bulk behind paid membership; we deliberately don't (positioning differentiator: trust + transparency > extraction)
- Per-order quantity tier discount on bulk is separate from on-demand velocity tier (see [[ilaunchify-bulk-vs-velocity-dual-system]])
- Sub-MOQ requests default to SUGGEST_ON_DEMAND policy — converts hard reject into sale; partner can override to REJECT_BELOW per product

**Parallel principle for the partner side** (locked 2026-06-04): the same logic applies to the partner tier ladder — see [[ilaunchify-partner-tier-progression]]. Verified is free arrival, Trusted is paid commitment (subscription unlocks tools), Anchor is earned recognition (no subscription, lowest fee, invite-only). Subscription gates ADVANCED TOOLS we pay fixed cost for. It never gates the ability to take orders, list products, accept dispatches, or receive payouts.

Reference: `docs/builds/_V1.5_BULK_PRICING.md` (full spec), `outputs/iLaunchify_Live_Master_Model.xlsx` Bulk Tier sheet (live model), [[ilaunchify-velocity-tiers-on-top-of-subscription]], [[ilaunchify-partner-tier-progression]], [[ilaunchify-operational-philosophy-v1]].
