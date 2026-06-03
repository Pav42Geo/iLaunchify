---
name: ilaunchify-g3-standardize-capabilities
description: "Phase G3 commitment — substrate / packaging-material / finish capabilities need a real standardised schema, not free-text JSON"
metadata: 
  node_type: memory
  type: project
  originSessionId: f1d70585-c159-4eab-861c-0f3599bfdeaf
---

Pavel decision 2026-05-29 during Phase G scoping: standardise partner Substrate / PackagingMaterial / finish capabilities properly inside G3 instead of papering over `PartnerService.capabilities` JSON.

**Why:** the production-options checkout step (Step 2 of the wizard) drives partner routing, MOQ, lead time, and cost. Letting partners declare these in unstructured JSON makes matching brittle (typos, casing, regional naming variants) and blocks marketplace partner-matching (#153).

**How to apply:** when building G3, add:
- A `Substrate` model (admin-curated catalog, similar shape to FinishType): slug, name, category (PAPER / FILM / SYNTHETIC / KRAFT / CLEAR), description, typical use, finish compatibility hints.
- A `PackagingMaterial` model scoped to packaging topology (bottle, jar, pouch, box, tub): slug, name, topology, sustainability tier, food-safe flag.
- `PartnerServiceSubstrate[]` + `PartnerServicePackagingMaterial[]` junctions (with per-partner price/lead-time overrides) so the picker reads from a typed source.
- Seed both catalogs from the existing free-text usage so live partners aren't blocked.
- Forward-pointer in PartnerService.capabilities JSON: only freeform fields stay there; substrate + packaging move to typed junctions.

Related: [[ilaunchify-partner-onboarding]] for the 5-layer model, [[ilaunchify-partner-team-model]] for who edits these on the partner side.
