---
name: ilaunchify-accessories-are-partner-bundled-only
description: Accessories (wooden spoons, ribbons, rosette caps, inserts) exist on iLaunchify only when a partner explicitly lists them AND commits to physically bundling them with their product in one pack-out. No platform-curated, no cross-partner orchestration in V1/V1.5.
metadata:
  type: project
---

Pavel correction 2026-06-03 — I proposed a "PLATFORM_CURATED" accessory model where the platform suggests accessories (e.g., wooden honey dipper) even when the manufacturer doesn't carry them, routing fulfillment to a different partner. Pavel pushed back: without an answer to "who puts the spoon next to the jar at pack-out time," the platform is selling something it can't operationally deliver.

**The principle:** the listing partner IS the fulfillment partner, always. An accessory exists on iLaunchify only when the partner has:

1. Explicitly listed it in their `/partner/accessories` catalog
2. Linked it to specific products they offer (`applicablePartnerOfferingIds`)
3. Committed to physically including it with the order's pack-out

**Workflow visibility — all three touchpoints are conditional:**

- Marketplace product detail: "X brand accessories available" badge renders only if partner has linked offerings
- Product Builder: "Preview brand accessories" link hidden when no offerings
- Checkout: accessories step (G7 stub renamed "Brand Add-ons") skipped entirely when none exist; stepper goes straight to Production Review

**Why:** without this principle, the platform makes promises it can't keep — coordination across partners for a single pack-out is operationally complex and breaks shipping/tracking/return flows. Per "operational trust > margin optimization" — preserve the trust by only offering what can actually be delivered together.

**V2 forward-pointer:** when the pooling + buffer-inventory architecture from `PRODUCTION_ORCHESTRATION.md` exists, cross-partner accessory routing becomes feasible. Until then, partner-bundled-only.

**Schema:** `AccessoryOffering.partnerServiceId` is required (not nullable). No `source` enum. No `fulfillmentPartnerId` (always equals listing partner). No platform-curated catalog. No admin curation tooling for accessories (partners are the only source).

Related: [[ilaunchify-operational-philosophy-v1]], [[ilaunchify-orchestration-thesis]], [[clarify-audience-before-building-customer-facing-flows]]
