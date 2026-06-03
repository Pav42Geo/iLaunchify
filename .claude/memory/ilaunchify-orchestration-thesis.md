---
name: ilaunchify-orchestration-thesis
description: "iLaunchify's core platform thesis (Pavel 2026-05-26) — this is a distributed manufacturing orchestration system, NOT a simple marketplace. The 4-mode routing engine + invisible-orchestration UX is the long-term moat. Direct routing is V1; pooling + buffer inventory are V2 moat features."
metadata: 
  node_type: memory
  type: project
  originSessionId: f1d70585-c159-4eab-861c-0f3599bfdeaf
---

**The thesis (Pavel 2026-05-26):**

> "We are not building a simple marketplace. We are building a distributed manufacturing orchestration system. The pain point is not 'finding a manufacturer.' The real problem is synchronizing incompatible operational constraints between multiple fulfillment partners while keeping the experience simple for creators."

iLaunchify decomposes a creator order into a **production workflow graph** of N partner-service nodes (manufacturer / label printer / co-packer / packaging supplier / warehouse / logistics). Each node has its own MOQ, lead time, region, capability matrix, certifications. The platform's job is to find a valid graph instantiation — and *hide the discovery process entirely*. Creator gets one quote, one timeline, one approval. Orchestration is invisible (Stripe-hides-banking, AWS-hides-infra style).

**The 4-mode routing engine (Pavel's framing):**

1. **Direct Compatible Routing** — all partners' constraints align naturally. V1.
2. **Aggregation Pooling** — combine demand across creators to break MOQ barriers. V2. The short-term moat.
3. **Buffer Inventory** — platform stocks neutral packaging so only labels need custom printing. V2.
4. **Intelligent Upgrade Suggestions** — "Increase to 150 to unlock X" transparency framed as consequence not constraint. V1.5.

**Dimensions the architecture must handle (Claude additions):**

- **Bill-of-Materials per ProductTemplate** — each product type declares which ServiceTypes it needs. Admin-curated metadata, not on Order.
- **Pool fairness / windowing** — time windows + FIFO + under-fill backstop (platform underwrites OR creator surcharges OR pool spills).
- **Risk model for failed pools** — financial absorption decisions baked into engine, not bolted on.
- **State-machine extensions** — `WAITING_FOR_POOL`, `POOL_BOUND`, `PULLING_FROM_STOCK`, `NEUTRAL_FILLED` are new V2 states.
- **Transparency boundary** — Mode 4 must frame MOQ walls as *consequences* ("28% cheaper / 2 weeks faster") not as *constraints* ("printer needs 500 minimum"). Otherwise UX leaks orchestration complexity.
- **Data flywheel** — every completed order teaches the engine which partner combos deliver on time / low defects / Premier-tier-worthy. Long-term moat, not short-term.
- **Operational risk weight** — scoring function MUST include operational risk alongside cost + lead time. Per [[ilaunchify-operational-philosophy-v1]]: operational trust > margin optimization. Sometimes the engine recommends a *worse* route deliberately for risk reasons.

**V1 scope (minimal to enable V2 moat without painting into a corner):**

- Schema: `ProductTemplate.billOfMaterials` (JSON or junction). `PartnerService.capabilities` normalized per ServiceType (LABEL_PRINTING declares minMoq/maxMoq/supportedFinishes/leadTimeDaysMin-Max/regionId, etc.). Keep flexible JSON for V2-future fields.
- New module: `packages/orders/src/orchestration.ts` sitting above existing `routing.ts` (#53). Input: creator product + quantity + region. Output: 1–3 candidate production graphs scored by (cost / lead time / operational risk / creator-tier preference from PLATFORM_SPEC).
- Schema breadcrumbs for V2 (additive, no V1 behavior): `Order.pooledBatchId` (nullable FK), `PartnerService.acceptsPooled` (bool default false), `PartnerService.pooledMinPercent` (Int).
- Mode 4 stub: when no viable graph at requested quantity, surface a one-liner *consequence* in post-canvas wizard's Production Options step. No detailed MOQ explanation.

**V1 deliberately doesn't ship:**

- `PooledProductionBatch` table / time windows / fairness logic
- `PlatformInventoryItem` table / neutral-stock workflows
- Sliders + real-time pricing for Mode 4 (V1.5 polish)
- Per-combination success telemetry / data flywheel scoring (needs volume first)

**How this connects to other locked decisions:**

- [[ilaunchify-business-model]] — orchestration IS the B2B model's inside layer
- [[ilaunchify-partner-team-model]] — different partner members handle different orchestration roles (Prepress reviews files, Production runs press)
- [[ilaunchify-operational-philosophy-v1]] — operational trust > margin justifies the risk-weighted scoring function
- PLATFORM_SPEC.md Partner tiers (Verified / Trusted / Premier) — explicit boost in scoring function for higher tiers
- PRINT_PRODUCTION_WORKFLOW.md — the per-partner Gate B + payment-on-all-approvals rule applies to every node in the production graph, not just one partner
- DESIGN_STUDIO_REBUILD.md §8 (post-canvas wizard) — Step 2 (Production Options) is where Mode 4 surfaces; Step 4 (Fulfillment) is where the WAREHOUSE node in the graph gets picked

**How to apply this thesis going forward:**

- When designing ANYTHING that touches the creator → production flow, ask: does this expose orchestration complexity to the creator? If yes, hide it. The creator's mental model is "I want 50 protein powders with my label" — never "I need to coordinate manufacturer + printer + co-packer."
- When designing partner-side surfaces, the opposite: partners need maximum operational clarity. They see their slice of the graph and only their slice.
- When admin needs to debug a stuck order, they see the full graph + all node states + the routing engine's scoring breakdown that picked this graph over alternatives.
- Never tell a creator "the printer requires X" — always tell them "your order will be Y if you do Z." Same data, opposite framing.

**Documented in full**: `docs/PRODUCTION_ORCHESTRATION.md` (to be written when Pavel confirms the brief — see next conversation turn).
