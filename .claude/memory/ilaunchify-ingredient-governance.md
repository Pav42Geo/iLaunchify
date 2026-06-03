---
name: ilaunchify-ingredient-governance
description: Sliding verification (SELF_ATTESTED → ADMIN_VERIFIED → LIBRARY_PROMOTED) keeps partner velocity high while admin oversight scales via risk-weighted attention + a library promotion queue that absorbs the long tail.
metadata: 
  node_type: memory
  type: project
  originSessionId: f1d70585-c159-4eab-861c-0f3599bfdeaf
---

In iLaunchify, partner-private ingredients are usable in published products immediately at `SELF_ATTESTED` level — admin is NOT in the critical path of product approval. This is intentional to keep partner velocity high. Admin scales control through three layers:

**1. Hard blocks (cheap, automated)**
- Banned-substance dictionary (ephedra, sibutramine, undeclared stimulants, certain SARMs precursors, etc.) — partner literally cannot save the ingredient.
- Soft-warn dictionary (controversial: high-dose caffeine, kratom, certain herbal extracts) — partner can save but admin notified high-priority.

**2. Risk-weighted attention (admin only looks where it matters)**
- Self-attested ingredients > 5% of recipe weight → red flag in product approval queue ("high-percentage unverified ingredient"). Admin should verify before approving.
- Self-attested ingredients < 5% → soft flag only ("N self-attested ingredients"). Admin can verify but not required.
- Allergen confirmation: declaring zero Big-9 allergens triggers "Are you sure?" with a "flag for admin review" default.

**3. The compounding tool — library promotion queue**
`/admin/ingredients/library-promote` ranks private ingredients by cross-partner usage. Admin opens a row, cleans the name + labelDeclarationName + allergen flags, saves as a new LIBRARY Ingredient, system auto-relinks matching private ingredients. After 6 months the long tail shrinks dramatically — admin's verification work concentrates on genuinely new ingredients rather than scaling linearly with partner count. Partners whose private ingredient gets absorbed get a courtesy "Contributed to Library" badge.

**Duplicate detection at creation time** kills 60-70% of new private ingredient creations before they happen via fuzzy match against Library + own private + similar partners' private (anonymized) in the "Add custom ingredient" form.

**V1 launch: AGGRESSIVE Curated Library seed** of ~1,000-1,200 items across 12 categories (Pavel's call 2026-05-24). Roughly 70-100h of curator work as a spreadsheet-driven contractor brief. One-time investment buys 12+ months of partner velocity.

**Why:** Pavel asked 2026-05-24 how admin would control partner-uploaded ingredients as the platform grows. The tension is partner velocity vs admin control. The answer is sliding verification + risk weighting + a promotion queue that compounds. Admin is informed, not blocking. FDA tolerance is ±20% (21 CFR 101.9(g)) so self-attested errors rarely cause regulatory issues; partner is contractually responsible for COA-driven validation per production lot.

**How to apply:** When designing or building anything that touches partner ingredient flows, NEVER make admin verification a blocking gate for product submission. Surface flags, not gates. Wire usage stats so admin's attention concentrates on cross-partner repeat ingredients. Always show source + verification badges in the picker so partners understand what they're picking. The promotion wizard is the single most important scaling mechanism — it must exist by the time the platform has 50+ partners.

Related: [[ilaunchify-ingredient-sourcing]] (the 3-tier source model this governs), [[ilaunchify-flavors-as-presets]] (consumers of the picker).

Canonical spec: `docs/MANUFACTURER_PRODUCT_BUILDER.md` §4a.5 + §4a.6.
