---
name: ilaunchify-storefront-deferred
description: Public/consumer-facing storefront pages are deferred indefinitely. iLaunchify stays B2B-internal-only for V1+. Decided 2026-05-25 in
metadata: 
  node_type: memory
  type: project
  originSessionId: f1d70585-c159-4eab-861c-0f3599bfdeaf
---

Pavel confirmed (2026-05-25) — any creator-facing public storefront (public brand showcase, share-link brand kit, /@brand-handle pages) is deferred to a later stage. For now: **no public surface, dashboard-internal preview only**.

**Why:** The locked B2B model ([[ilaunchify-business-model]]) already excludes consumer commerce. We deleted `apps/storefront` in #110 for the same reason. Re-introducing any public web surface — even a read-only showcase — would create maintenance burden and re-open scope debates without solving a problem Pavel has today.

**Implication for Brand Identity messaging:** When describing what the Brand Identity Studio feeds, say "label renderer + Design Studio templates" — drop the "+ storefront theme" phrasing that was a holdover from the deleted storefront. The Brand Preview panel inside the Studio is the only "storefront-like" surface that exists for V1.

**How to apply:** If a future task description, doc, or my own suggestion mentions storefronts, brand showcase pages, public `/@handle` URLs, or consumer-facing brand surfaces — pause and surface this decision before building. Revisit only when Pavel explicitly says he's reconsidering.
