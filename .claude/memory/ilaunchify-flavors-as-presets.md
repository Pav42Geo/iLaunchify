---
name: ilaunchify-flavors-as-presets
description: "A product's flavor variations are FlavorPreset rows overlaying one base recipe, NOT separate ProductTemplates or separate recipes."
metadata: 
  node_type: memory
  type: project
  originSessionId: f1d70585-c159-4eab-861c-0f3599bfdeaf
---

In iLaunchify, when a partner offers a product in multiple flavors (e.g., Whey Protein in Chocolate / Vanilla / Strawberry), the model is **one ProductTemplate + N FlavorPreset rows**, never multiple ProductTemplates and never multiple recipe objects to maintain in parallel.

**Why:** Pavel raised this 2026-05-24 because FOD's old MY RECIPES tab modeled each flavor as a separate recipe and partners had to keep them in sync manually. The new model:
- Base recipe (slots) is shared across all flavors — partner edits once.
- Each FlavorPreset specifies per-slot picks (which option of a replaceable slot applies) + optional flavor-only extras + a price delta.
- Compliance label, allergens, cost, weight all resolve per (template × flavorPreset × packagingSystem).
- Order rows snapshot the resolved recipe at checkout — partner edits don't change historical orders.

**How to apply:** When designing or building anything that touches the product builder, the creator customize flow, the order pipeline, or the compliance pre-render, treat FlavorPreset as the unit of recipe variation. Don't suggest "create a separate product for vanilla." Don't suggest "let the creator freely pick any slot option" — partner curates the combinations they're willing to manufacture. Single-flavor products auto-get one preset named "Standard" with no slot overrides so the partner never has to touch the Flavors panel.

Multi-flavor packaging (variety packs) interacts via PackagingSystem's `flavorMode: MULTI` + `flavorPolicy: CREATOR_PICK | PARTNER_FIXED` — creator either composes the assortment or accepts the partner's fixed bundle. See [[ilaunchify-business-model]] for the broader B2B production context.

Canonical spec: `docs/MANUFACTURER_PRODUCT_BUILDER.md` §5.
