---
name: ilaunchify-subscription-tiers
description: "Creator subscription tiers (Maker / Builder / Master) and partner tiers (Verified / Trusted / Premier) are fully specified in docs/PLATFORM_SPEC.md §Tier 1. Don't re-derive — always read that doc as the source of truth."
metadata: 
  node_type: memory
  type: reference
  originSessionId: f1d70585-c159-4eab-861c-0f3599bfdeaf
---

iLaunchify's subscription / tier model is **already specified in detail** in `docs/PLATFORM_SPEC.md` under "Tier 1 — Business model + monetization" (around line 90-172). Before designing any new feature that touches pricing, plan gates, tier perks, partner promotion, or sample-order economics — read that section first.

**Creator tiers (locked):** Maker (free) → Builder (~$49-99/mo or ~$490-990/yr) → Master (~$199-299/mo or ~$1,990-2,990/yr). Annual billing = 2 months free (~17% discount).

**Partner tiers (locked):** Verified → Trusted → Premier. Promotion gates documented (Verified→Trusted: 25 orders, 90% on-time, 0 disputes/90d; Trusted→Premier: 100 orders, 95% on-time, AM interview).

**Key feature gates Pavel locked:**
- Production-order platform fee: Maker 15% / Builder 12% / Master 9%
- Marketplace commission: Verified 15% / Trusted 12% / Premier 8%
- Active products: 1 / Unlimited / Unlimited (creator side)
- Brand profiles: 1 / 3 / Unlimited
- Channel connections (V1.1+): 1 / 3 / All 6
- Bulk pricing visibility: **Master-only gate** (Pavel decision 2026-05-19)
- Premier partner access: Master-only
- First Sample Discount: platform-wide perk for every new creator (one-time, up to 3 products × 3 units, default 50% off production cost). Master tier gets a better deal automatically (fully free + credited).

**Where this gets used (and where I keep forgetting to align):**
- `SubscriptionPlan` schema seeding (codes: `MAKER`/`BUILDER`/`MASTER`) — values come from PLATFORM_SPEC, not invented
- Post-canvas wizard Step 3 (Shutterstock-style upsell, deferred to V1.5) — show "your current tier vs upgrade" cards using PLATFORM_SPEC numbers
- Partner promotion FSM — gates are admin-editable but defaults come from PLATFORM_SPEC §Tier 1
- Per-tier compliance depth, AI access, support SLA — all locked in the doc

**How to apply:** when a question comes up about "does X creator/partner get Y benefit at Z tier?", read `docs/PLATFORM_SPEC.md` first. If it's not in the doc, then ask Pavel. Don't speculate, and don't write "TBD" — the answer almost certainly already exists. Related: [[ilaunchify-business-model]] (the B2B model these tiers operate within).
