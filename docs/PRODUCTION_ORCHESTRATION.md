# Production Orchestration — Architecture Spec

**Status:** Locked 2026-05-26 (4 decisions locked; build sequence agreed).
**Supersedes:** none — new foundational document.
**Companion docs:** `PRINT_PRODUCTION_WORKFLOW.md` (per-partner gates, file validation, payment capture), `DESIGN_STUDIO_REBUILD.md` (canvas + post-canvas wizard).
**Scope:** how a creator order becomes a multi-partner production workflow graph, how the platform routes that graph across partners with incompatible operational constraints, and how this complexity is hidden from the creator.

---

## TL;DR

iLaunchify is a **distributed manufacturing orchestration system**, not a marketplace. The marketplace is its front door.

A creator order becomes a **production workflow graph** of N partner-service nodes (manufacturer / label printer / co-packer / packaging supplier / warehouse / logistics), each with its own MOQ, lead time, region, capability matrix, certifications. The orchestration engine's job is to find a valid graph instantiation across these constraints and **hide that discovery process entirely**. The creator sees one quote, one timeline, one approval. The same way Stripe hides banking rails and AWS hides infrastructure, iLaunchify hides manufacturing orchestration.

Four routing modes, sequenced V1 → V2:

| Mode | What it does | Phase |
|---|---|---|
| **1. Direct Compatible Routing** | All partners' constraints align naturally; pick the cheapest viable graph | **V1** |
| **2. Aggregation Pooling** | Combine demand across creators to break MOQ barriers (the moat) | V2 |
| **3. Buffer Inventory** | Platform stocks neutral packaging; only labels are customized | V2 |
| **4. Intelligent Upgrade Suggestions** | "Order 150 to unlock 28% cheaper" — consequence framing, not constraint exposure | V1 stub, V1.5 polish |

V1 builds Mode 1 with V2-ready schema breadcrumbs. V2 unlocks the moat features.

---

## 1. The thesis (locked, 2026-05-26)

> *"We are not building a simple marketplace. We are building a distributed manufacturing orchestration system. The pain point is not 'finding a manufacturer.' The real problem is synchronizing incompatible operational constraints between multiple fulfillment partners while keeping the experience simple for creators."*

— Pavel, 2026-05-26

The biggest mistake we could make is treating this as **creator → manufacturer**. In reality, a single creator order touches: manufacturer + label printer + co-packer + packaging supplier + logistics + QA + warehousing. Each has different MOQs, lead times, regions, capacities, operational standards. Matching by MOQ alone is one of dozens of constraints.

The platform's value isn't "we have manufacturers." Anyone can list manufacturers. The platform's value is **we orchestrate the production graph so the creator never has to**.

Per [[ilaunchify-orchestration-thesis]] in memory.

---

## 2. The mental model — Production Workflow Graph

A creator order decomposes into a directed graph of partner-service nodes. Each node:

- Has a **ServiceType** (`MANUFACTURING` / `COPACKING` / `LABEL_PRINTING` / `WAREHOUSE`)
- Is fulfilled by exactly one `PartnerService` row (after routing decides which)
- Has incoming dependencies (other nodes that must complete before it can start)
- Has outgoing dependents (other nodes that need its output)
- Carries its own state (per `PRINT_PRODUCTION_WORKFLOW.md` per-partner gates)

**Example — bottled supplement, 500 units, ship to creator's home:**

```
        ┌────────────────────────┐
        │ Manufacturer (fill)    │
        │ - MOQ 500              │
        │ - Lead 7 days          │
        │ - Region: TX           │
        └─────────────┬──────────┘
                      │ needs raw bottles, caps,
                      │ filled bottles before label
                      ▼
        ┌────────────────────────┐         ┌────────────────────────┐
        │ Bottle supplier        │   +     │ Cap supplier           │
        │ - MOQ 1000 (Mode 2/3)  │         │ - MOQ 5000 (Mode 2/3)  │
        │ - Lead 14 days         │         │ - Lead 10 days         │
        └────────────────────────┘         └────────────────────────┘
                      │
                      ▼
        ┌────────────────────────┐
        │ Label printer (CMYK)   │
        │ - MOQ 500              │
        │ - Lead 5 days          │
        │ - Region: CA           │
        └─────────────┬──────────┘
                      │ apply labels, pack
                      ▼
        ┌────────────────────────┐
        │ Co-packer / fulfillment│
        │ - bundles, ships       │
        │ - Lead 3 days          │
        └─────────────┬──────────┘
                      │
                      ▼
                Ship to creator
```

**The graph is product-template-specific.** A pouch product has a different graph than a bottle. A sticker has a much simpler graph (substrate → print → ship). The graph topology is encoded in the **Bill-of-Materials** on `ProductTemplate` (§4).

**Routing decides which specific PartnerService instantiates each node.** The graph topology is static (defined by the product's BOM); the partner assignments are dynamic (computed per-order by the orchestration engine).

---

## 3. The four routing modes (decisions locked)

### Mode 1 — Direct Compatible Routing (V1)

All nodes' constraints align naturally for this creator's order:

- All partners' MOQ ranges include the creator's requested quantity
- All partners can deliver in compatible lead times (no node's output is delayed past the next node's start)
- All partners serve the creator's region (or can ship to it economically)
- All partners' capability matrices match the product's BOM requirements (substrate, finish, certifications, etc.)

When all green: cheapest viable graph wins. This is the V1 baseline.

**Implementation:** `packages/orders/src/orchestration.ts` (new) on top of existing `routing.ts`. Constraint-based filter → cost+lead-time+risk-weighted scoring (§7) → top-3 graph candidates → pick winner OR present to creator.

### Mode 2 — Aggregation Pooling (V2 — the moat)

When the creator's quantity doesn't meet a partner's MOQ, the platform **batches multiple creators' orders into one upstream production run**.

Example: 10 creators each want 50 protein-powder bottles with their own labels. Each individual order misses the label printer's 500-unit MOQ. The platform batches all 10 label orders into one 500-unit print run.

Each creator's order is still tracked separately downstream; only the label-print step is pooled.

**Why this is the long-term moat:** any platform can list partners. Only the platform with enough demand density can credibly *aggregate* it. The economic value of pooling compounds as the platform scales — and a creator who experiences "I got my 50 units at the 500-unit-MOQ price" doesn't go anywhere else.

**Why deferred to V2:** requires platform-side workflows (pool windows, fairness logic, under-fill underwriting), financial commitment (the platform sometimes eats unfilled pools), and minimum demand density to function. Building too early creates a broken UX where pools never fill.

Full spec in §11.

### Mode 3 — Buffer Inventory (V2)

The platform itself maintains neutral packaging stock — generic bottles, blank pouches, standard caps — at one or more warehouse partners.

The creator's only custom layer is **the label** (the cheap, fast, digitally-printed component). Custom containers (the expensive, slow, MOQ-heavy component) are pulled from platform stock.

Example: instead of "1000 custom-printed pouches" (MOQ wall), the order becomes "1000 platform-owned blank pouches + 50 digitally-printed labels applied at the co-packer." Creator orders 50 units; platform absorbs none of the inventory risk because the pouches will eventually be used by some creator.

**Why this works:** ~80% of packaging cost / lead time / MOQ pain is the container. Labels can be printed digitally in any quantity above ~25 units with effectively no MOQ. Removing the container customization removes the bottleneck.

**Why deferred to V2:** requires real warehousing operations (platform owns and counts inventory), working capital on the platform's balance sheet, replenishment forecasting, and integration with WAREHOUSE partner services.

### Mode 4 — Intelligent Upgrade Suggestions (V1 stub, V1.5 polish)

When Mode 1 fails (no viable direct graph at the creator's quantity), the engine computes the *next* viable quantity threshold and surfaces it as a **consequence**, not a constraint.

✅ **Right framing:** "Order 150 to ship 2 weeks faster and reduce per-unit cost by 28%."
❌ **Wrong framing:** "The label printer requires a minimum of 500 units."

The platform translates the underlying operational constraint into an outcome the creator cares about. They never see "MOQ" or partner names.

**V1 (locked decision 2026-05-26):**
- One-liner consequence text in the post-canvas wizard's Step 2 (Production Options)
- Up to 3 quantity-threshold ladder options shown
- Hard-block ONLY when no viable route exists at any reasonable quantity (then a "join waitlist / contact us" empty state, not an MOQ explanation)

**V1.5:** real-time price recalc as creator nudges the quantity slider; multiple consequence dimensions shown side-by-side ("cheaper / faster / premium-quality" options).

---

## 4. Bill-of-Materials (BOM) — admin-curated, on ProductTemplate

**Decision locked 2026-05-26:** the BOM lives on `ProductTemplate`, admin-curated. Creator-level overrides land in V2 for premium creators.

**Reasoning:**
- Keeps orchestration predictable — every creator picking the same template gets a deterministic graph topology
- Avoids invalid creator configurations (can't accidentally skip the label step)
- Simplifies V1 routing — engine only needs to evaluate one graph shape per template
- Reduces support load — admin curates 30 product templates well; 30,000 creators don't each invent their own

Creators customize *branding / design* (per `DESIGN_STUDIO_REBUILD.md`) — never *production structure*.

### 4.1 Schema

```prisma
model ProductTemplateBOM {
  id                String       @id @default(cuid())
  productTemplateId String
  serviceType       ServiceType                            // MANUFACTURING | COPACKING | LABEL_PRINTING | WAREHOUSE
  required          Boolean      @default(true)            // false = optional add-on, creator may opt out
  preferredSubType  String?                                // e.g. 'OFFSET' | 'DIGITAL' for LABEL_PRINTING
  quantityRatio     Float        @default(1.0)             // 1.0 = one unit per product; >1 = accessories
  sequenceOrder     Int                                    // graph ordering; lower runs first
  notes             String?                                // admin-facing notes only
  productTemplate   ProductTemplate @relation(fields: [productTemplateId], references: [id], onDelete: Cascade)
  @@unique([productTemplateId, sequenceOrder])
  @@index([productTemplateId])
}
```

V2 additions when creator overrides land:

```prisma
// V2 only — schema breadcrumb, not used in V1
model OrderBOMOverride {
  id            String  @id @default(cuid())
  orderId       String  @unique
  overridesJson Json                              // creator-supplied per-node service-type swaps
  approvedByAdminUserId String?                   // some overrides require platform-side approval
  approvedAt    DateTime?
}
```

### 4.2 Example BOM rows for common products

**Whey protein powder, 500g bottle:**

| Order | ServiceType | Required | PreferredSubType | QtyRatio | Notes |
|---|---|---|---|---|---|
| 1 | MANUFACTURING | ✓ | — | 1.0 | Powder formulation + bottling |
| 2 | LABEL_PRINTING | ✓ | DIGITAL | 1.0 | One label per bottle |
| 3 | COPACKING | ✓ | — | 1.0 | Apply label, cap, pack into case |
| 4 | WAREHOUSE | ✗ (optional) | — | 1.0 | Only if ship-to is platform warehouse |

**Sticker (2x3 inches):**

| Order | ServiceType | Required | PreferredSubType | QtyRatio | Notes |
|---|---|---|---|---|---|
| 1 | LABEL_PRINTING | ✓ | DIGITAL | 1.0 | Substrate + print + cut |
| 2 | COPACKING | ✗ | — | 0.0 | Direct ship from printer if low qty |

**Beverage in glass bottle:**

| Order | ServiceType | Required | PreferredSubType | QtyRatio | Notes |
|---|---|---|---|---|---|
| 1 | MANUFACTURING | ✓ | — | 1.0 | Beverage formulation + filling |
| 2 | LABEL_PRINTING | ✓ | — | 1.0 | Shrink sleeve or wrap-around label |
| 3 | COPACKING | ✓ | — | 1.0 | Apply label, cap, case pack |

The admin Product Template editor (V1.5+) lets admins add/remove BOM rows when curating a new template.

---

## 5. The constraint-based routing engine

### 5.1 Inputs

```typescript
interface RoutingInput {
  productTemplateId: string
  variantId: string                          // resolves to specific BOM + flavor preset
  quantity: number
  creatorRegionId: string                    // for proximity scoring
  creatorTier: 'MAKER' | 'BUILDER' | 'MASTER' // for tier-aligned partner access
  shipToType: 'CREATOR_ADDRESS' | 'WAREHOUSE_PARTNER'
  shipToPartnerServiceId?: string            // when WAREHOUSE_PARTNER
  // V1.5+:
  preferredLeadTimeDays?: number
  maxBudgetCents?: number
}
```

### 5.2 Algorithm (V1)

```
1. Load ProductTemplate.billOfMaterials (ordered by sequenceOrder)

2. For each BOM line (each graph node):
     a. Filter PartnerService rows to those matching:
        - serviceType = line.serviceType
        - status = ACTIVE
        - capabilities encompass line.preferredSubType (if any)
        - capabilities.minMoq <= quantity * line.quantityRatio
        - capabilities.maxMoq >= quantity * line.quantityRatio (or unlimited)
        - PARTNER tier accessible to creator tier (Master can use Premier; Maker cannot)
        - certifications match product requirements (FDA / NSF / etc.)
        - regionId compatible (same region, adjacent region, or partner ships nationally)

     b. If zero candidates: Mode 1 fails for this line → trigger Mode 4 fallback (§6).

     c. If multiple candidates: score each by §7 weights and keep top-K (K=5).

3. Cartesian-product the top-K candidates across all lines into candidate graphs.
   (For 4 BOM lines × 5 candidates = 625 possible graphs. Prune aggressively in step 4.)

4. Score each candidate graph by:
   - Total cost (sum of per-node costs at this quantity)
   - Lead time (max of node lead times for parallel nodes; sum for serial)
   - Operational risk (per-partner historical reliability — V1 uses static tier score)
   - Tier alignment (creator tier matched to highest-tier partner in graph)
   - Region proximity (graph nodes close to creator and to each other)

5. Return top 3 graphs.
   V1: auto-select the highest-scoring one and present as the single quote.
   V1.5+: surface all 3 to creator with a "show options" toggle.
```

### 5.3 Outputs

```typescript
interface RoutingOutput {
  graphCandidates: ProductionGraph[]         // top 1-3 candidates
  bestCandidate: ProductionGraph             // auto-selected by score
  // When no viable graph exists at this quantity:
  modeForResult: 'DIRECT' | 'NEEDS_UPGRADE' | 'NO_VIABLE_ROUTE'
  upgradeSuggestion?: {
    minViableQuantity: number
    estimatedSavingsPercent: number          // vs ordering one extra
    estimatedLeadTimeDays: number
    framedConsequence: string                // human-readable, per §6 framing rules
  }
}

interface ProductionGraph {
  nodes: GraphNode[]                         // one per BOM line, in sequenceOrder
  totalCostCents: number
  estimatedLeadTimeDays: number
  score: number                              // composite, debugging only
  scoreBreakdown: Record<string, number>     // per §7 — audit + admin
}

interface GraphNode {
  bomLineId: string
  partnerServiceId: string                   // the assigned PartnerService
  estimatedCostCents: number
  estimatedLeadTimeDays: number
  capabilityMatchNotes: string[]             // e.g. ["digital printing matched", "FDA cert verified"]
}
```

The chosen graph's nodes become `OrderPartnerApproval` rows when the creator confirms the order (per `PRINT_PRODUCTION_WORKFLOW.md` §2 — each node needs Gate B independently before payment captures).

---

## 6. Sub-MOQ behavior (Mode 4, V1) — consequence framing

**Decision locked 2026-05-26:** never hard-fail immediately. Use consequence-framed nudges; hard-block only when absolutely no route exists at any quantity.

### 6.1 Three-layer fallback

When the engine fails to find a viable direct graph at the creator's requested quantity, it cascades through three layers:

**Layer A — Adjusted-quantity suggestion (preferred outcome):**
The engine re-runs the routing algorithm with quantity bumped to the next MOQ tier across BOM lines. If a viable graph exists at quantity N (where N > requested), surface:

> *"Order N to unlock production at $X/unit (save Y% per unit and ship Z days faster)."*

V1 shows up to 3 such suggestions if multiple thresholds exist (e.g. 100, 250, 500). Default to displaying just the *lowest* viable threshold to avoid overwhelming the creator.

**Layer B — Alternative-spec suggestion:**
If no viable graph exists at the requested OR adjusted quantity using the preferred BOM sub-types, the engine retries with alternate sub-types (e.g. switch from `LABEL_PRINTING-OFFSET` to `LABEL_PRINTING-DIGITAL`). Framed as:

> *"Switch to digital printing to unlock production at this quantity (no setup fees, ships 5 days faster, slightly less color depth than offset)."*

V1.5+. V1 just defaults to whichever sub-type yields the lowest minimum viable quantity.

**Layer C — Polite hard-block:**
When no graph exists at any reasonable quantity (e.g. specialty packaging that requires 10k+ MOQ with no platform aggregation yet), the wizard shows:

> *"We don't have production capacity for this product configuration yet. Join the waitlist, or [contact us] to discuss custom production."*

Never expose "the printer's MOQ is too high" or partner names.

### 6.2 Framing rules (enforced in code, not in copy review)

The orchestration module exposes `framedConsequence(): string` for every Layer A/B suggestion. The rules:

- Output starts with an *action verb* the creator controls: "Order", "Switch", "Choose"
- Includes at least one *outcome dimension* (cost / lead time / quality / fulfillment speed)
- Never includes operational nouns: "MOQ", "co-packer", "minimum", "supplier", "vendor", "printer requires"
- Never includes partner names
- Never explains the underlying constraint

Helper utility in `packages/orders/src/orchestration/framing.ts`:

```typescript
function framedConsequence(
  reason: 'MIN_QTY_FOR_PRODUCTION' | 'CHEAPER_AT_TIER' | 'FASTER_AT_TIER' | 'SUBTYPE_SWITCH',
  delta: { quantityNeeded?: number; savingsPercent?: number; daysSaved?: number; subTypeFrom?: string; subTypeTo?: string },
): string {
  // Returns one of ~12 templated strings, validated against the rules above.
  // Admin can override per market / per product if cultural framing differs.
}
```

This keeps the orchestration → UX boundary tight: the engine speaks in *outcomes*, the wizard renders those outcomes directly. No layer in between leaks operational complexity.

---

## 7. The scoring function

Each candidate `ProductionGraph` gets a composite score:

```
score = w_cost  * costFactor(graph)
      + w_lead  * leadTimeFactor(graph)
      + w_risk  * operationalRiskFactor(graph)
      + w_tier  * tierAlignmentFactor(graph, creatorTier)
      + w_region * regionProximityFactor(graph, creatorRegion)
```

### 7.1 Weights (V1 defaults; admin-tunable per market / per product)

| Weight | Default | Rationale |
|---|---|---|
| `w_cost` | 0.35 | Cost matters but isn't everything |
| `w_lead` | 0.20 | Lead time matters less than cost for most creators; very important for samples/first runs |
| `w_risk` | 0.25 | Per [[ilaunchify-operational-philosophy-v1]] — operational trust > margin |
| `w_tier` | 0.10 | Creator-tier-aligned partner access (Master gets Premier; Maker doesn't) |
| `w_region` | 0.10 | Proximity reduces shipping cost + lead time; modest direct influence |

Sum = 1.0. Easy to reweight per market once data exists.

### 7.2 Factor definitions

- **costFactor**: normalized to [0, 1] across candidate graphs. `1 - (totalCost - minCost) / (maxCost - minCost)`. Higher = cheaper.
- **leadTimeFactor**: same shape but for `estimatedLeadTimeDays`. Higher = faster.
- **operationalRiskFactor**:
  - V1: static per partner tier. Premier = 1.0, Trusted = 0.7, Verified = 0.5.
  - V2: dynamic. Computed from per-PartnerService telemetry: `onTimeRate × (1 - disputeRate × 5)`.
- **tierAlignmentFactor**:
  - 1.0 if all partners in graph are accessible to creator's tier per `PLATFORM_SPEC.md`
  - 0.5 if any partner is a tier above creator's normal access (only happens for one-off allowances)
  - 0.0 if any partner is inaccessible to creator's tier (graph is invalid — pruned earlier)
- **regionProximityFactor**: `1.0` if all nodes in same region; `0.6` if adjacent (per [[ilaunchify-markets-and-regions]]); `0.3` if national; `0.0` if cross-border (V2+).

### 7.3 Audit trail

Every routing decision writes a `RoutingDecision` row:

```prisma
model RoutingDecision {
  id              String   @id @default(cuid())
  orderId         String?                                  // null if pre-checkout exploration
  inputJson       Json                                     // RoutingInput snapshot
  candidatesJson  Json                                     // all top-K graphs considered
  winningGraphJson Json                                    // the auto-selected graph
  scoreBreakdownJson Json                                  // per-factor scores
  routingEngineVersion String                              // for A/B tuning + post-hoc analysis
  modeUsed        RoutingMode                              // DIRECT | UPGRADE_SUGGESTION | NO_VIABLE_ROUTE
  createdAt       DateTime @default(now())
  @@index([orderId])
  @@index([createdAt])
}

enum RoutingMode {
  DIRECT
  UPGRADE_SUGGESTION
  NO_VIABLE_ROUTE
  POOLED                  // V2
  BUFFER_INVENTORY        // V2
}
```

Used for admin debugging (why was this order routed to Partner X?) and for tuning the scoring function over time.

---

## 8. Marketplace UX implications

**Decision locked 2026-05-26:** marketplace shows *outcomes*, not partners.

### 8.1 What the marketplace card shows

- Product name + image
- **Ships in X days** (computed: median lead time across viable graphs for typical quantity)
- **Starting at $X / unit at Y MOQ** (cheapest viable quote at lowest viable quantity)
- **Quality tier badge** (per highest partner tier in the cheapest graph — Master-only products show "Premier Production")
- **Flexibility badge** (V2): pooling-available / buffer-stock-available / customizable-flavors / multi-region

### 8.2 What the marketplace card does NOT show

- Partner names
- Specific manufacturer / printer / co-packer of any graph node
- Operational chain
- Internal MOQ math
- Routing scoring details
- "Manufactured by X, printed by Y" attribution chains

### 8.3 Product detail page (becomes the current `/products/[id]/customize`)

This is where Mode 4 surfaces interactively. The creator sees:

- Bigger product detail
- **Quantity selector** with real-time price + lead time recalc (Mode 4 in action)
- **Variant chooser** (flavor / size — sourced from `FlavorPreset` rows per [[ilaunchify-flavors-as-presets]])
- A clear "Open Design Studio →" CTA when the creator commits to a quantity + variant

The page does not explain WHY price changes at quantity thresholds. It just shows the consequence.

### 8.4 Where transparency IS required (and only there)

Some scenarios genuinely demand partner-name visibility:

- **Compliance contexts** — if the printed label says "Manufactured for Brand by Acme Foods, FDA #1234567," the creator must approve the attribution. Surface in the post-canvas Gate A approval modal, not in the marketplace.
- **Quality dispute resolution** — if a creator wants to escalate "this batch is defective," they need to know which partner produced it. Surface in the order detail page after delivery, behind an "Order details" expand-section.
- **Premier tier perk** — Master-tier creators may opt into seeing partner names + selecting specific partners. V2 feature.

Default state for V1 marketplace and product detail: **partner-opaque**.

---

## 9. State machine extensions (V2 prep)

V1 order states extend `PRINT_PRODUCTION_WORKFLOW.md` §3. V2 pooling and buffer-inventory add:

```
... existing V1 states ...
                                 ┌────────────────────────┐
                                 │ ROUTING_IN_PROGRESS    │ ← engine evaluating
                                 └─────────┬──────────────┘
                                           │
                                           ▼
                                 ┌────────────────────────┐
                                 │ ROUTING_RESOLVED       │ ← graph picked, quote sent
                                 └─────────┬──────────────┘
                                           │ creator commits
                       ┌───────────────────┼──────────────────────┐
                       ▼                   ▼                      ▼
              ┌──────────────┐    ┌──────────────────┐    ┌──────────────────┐
              │ DIRECT_QUEUED│    │ AWAITING_POOL    │ V2 │ PULLING_BUFFER   │ V2
              │ (V1 path)    │    │ (Mode 2)         │    │ (Mode 3)         │
              └──────┬───────┘    └────────┬─────────┘    └────────┬─────────┘
                     │                     │                       │
                     │              ┌──────┴──────┐                │
                     │              ▼             ▼                │
                     │      POOL_FILLED    POOL_FAILED              │
                     │              │             │                │
                     │              │     ┌───────┴────────┐       │
                     │              │     ▼                ▼       │
                     │              │  SPILL_NEXT    SURCHARGE_OR_   │
                     │              │  WINDOW         REFUND         │
                     │              │     │                          │
                     │              ▼     ▼                          ▼
                     └──────────────────────────────────────────────────┐
                                                                        │
                                                                        ▼
                                                     PROOF_PENDING_CREATOR
                                                     (per PRINT_PRODUCTION_WORKFLOW.md)
```

`AWAITING_POOL` orders show a creator-facing message: "Your order is queued for production. Expected start: [date]." No mention of pooling.

`SPILL_NEXT_WINDOW` orders auto-notify the creator and offer them the SURCHARGE_BREAKOUT path.

---

## 10. Pool risk underwriting (V2 — locked decision direction)

When a Mode 2 pool fails to fill its target by window close, three resolution paths exist. The system picks based on creator tier per `PLATFORM_SPEC.md` and creator preference:

| Path | Who pays | Default for tier |
|---|---|---|
| **Spill to next window** | No one (creator waits) | MAKER (default) |
| **Surcharge breakout** | Creator (opts to break out at higher per-unit cost) | Any tier on opt-in |
| **Platform underwriting** | Platform (eats the unfilled-pool cost) | MASTER (default) |

**The mapping:**

- **MAKER** creators default to *spill*. They get pooling savings when pools fill but accept wait risk. They can choose surcharge breakout at order time if urgent.
- **BUILDER** creators default to *spill* with an automatic offer of breakout if the pool stalls past N% of its target by 80% of window close.
- **MASTER** creators default to *underwriting*. Platform absorbs the difference up to a tier-defined annual underwriting budget (e.g. $5K/year of underwriting absorbed; beyond that, falls back to spill or surcharge). Master tier perk per `PLATFORM_SPEC.md` lines ~95-113.

**Why operational trust influences underwriting** (per [[ilaunchify-operational-philosophy-v1]]):

Underwriting decisions ALSO factor in creator history. A Master creator with 50 successful orders gets full underwriting; a brand-new Master creator (just upgraded from Builder) gets partial. This prevents abuse.

Schema breadcrumbs (additive to V1, no logic yet):

```prisma
model PooledProductionBatch {
  id                  String   @id @default(cuid())
  partnerServiceId    String                                    // the partner running the pool
  bomLineId           String                                    // which BOM line this pool covers
  poolWindowStart     DateTime
  poolWindowEnd       DateTime
  targetQuantity      Int                                       // partner's MOQ
  filledQuantity      Int      @default(0)                      // sum of OrderItems pointing here
  status              PoolStatus  @default(OPEN)                // OPEN | FILLING | FILLED | RUN | SPILLED | FAILED
  underwriterUserId   String?                                   // when status=RUN + filled < target, who absorbed
  underwriterCents    Int      @default(0)
  createdAt           DateTime @default(now())
}

enum PoolStatus {
  OPEN
  FILLING
  FILLED
  RUN
  SPILLED
  FAILED
}

// V1: nullable FK on Order
model Order {
  // ... existing fields ...
  pooledBatchId   String?                                       // V2: when participating in pool
}

// V1: nullable boolean on PartnerService
model PartnerService {
  // ... existing fields ...
  acceptsPooled        Boolean  @default(false)                 // V2: opt-in
  pooledMinPercent     Int?                                     // V2: e.g. 60 = will run if pool ≥ 60% filled
}
```

Full pooling logic, fairness rules, and window scheduling deferred to a V2 spec document.

---

## 11. Data flywheel (long-term moat)

Every completed order teaches the orchestration engine. V1 stores telemetry but doesn't yet feed it back into routing decisions. V2+ activates the loop.

### 11.1 Per-partner telemetry collected starting V1

For each `OrderPartnerApproval` row that reaches a terminal state, store:

- Routing-score-at-time-of-assignment (snapshot)
- Time from `PRODUCTION_LOCKED` → `IN_PRODUCTION` (responsiveness)
- Time from `IN_PRODUCTION` → `SHIPPED` (actual lead time vs quoted)
- Did the order require revisions / change orders post-Gate B (quality signal)
- Did the order result in a creator dispute (relationship signal)
- Delta-E color drift if measured (color signal, V2)

Aggregated per `PartnerService` over rolling 90-day windows:

```typescript
interface PartnerScorecard {
  partnerServiceId: string
  ordersCompleted: number
  onTimeRate: number              // shippedBy <= quotedBy
  disputeRate: number             // disputed orders / total
  revisionRoundAverage: number    // per PRINT_PRODUCTION_WORKFLOW.md §4
  averageLeadTimeDays: number
  averageDeltaE: number | null    // V2+
  // Composite — feeds the scoring function as operationalRiskFactor
  reliabilityIndex: number        // 0-1, computed from above
}
```

### 11.2 V2: feedback loop into scoring

`operationalRiskFactor` (§7.2) shifts from static tier-based to dynamic scorecard-based once the platform has enough volume (~50 orders per PartnerService for statistical relevance).

A partner consistently delivering on time, low disputes, low revisions → reliability index trends up → wins more graph slots in scoring → more orders → more data → tighter index.

A partner trending the wrong way → reliability index drops → wins fewer slots → less downstream damage to platform reputation → forced into tier-down conversations per `PLATFORM_SPEC.md` partner promotion gates.

This is the **long-term** moat that compounds with scale. Pooling (Mode 2) is the **short-term** moat that breaks the MOQ wall.

---

## 12. Schema additions per phase

### V1 (ship with the canvas + post-canvas wizard)

```prisma
// 1. ProductTemplate Bill-of-Materials (new junction table)
model ProductTemplateBOM { ... }                      // §4.1

// 2. PartnerService capability normalization (extend existing model)
// Replace flexible `capabilities Json` with per-ServiceType typed columns
// where possible. Existing JSON column STAYS for partner-private extensions.
model PartnerService {
  // existing fields...
  minMoq                Int?
  maxMoq                Int?
  leadTimeDaysMin       Int?
  leadTimeDaysMax       Int?
  regionId              String?                       // FK to Region (existing)
  // Service-type-specific structured fields (V1 minimal subset):
  supportedSubstrates   String[]                      // LABEL_PRINTING
  supportedFinishes     String[]                      // LABEL_PRINTING
  printProcesses        PrintProcess[]                // LABEL_PRINTING: OFFSET, DIGITAL, FLEXO
  certificationIds      String[]                      // FK array to PartnerCertificateInstance
  // Schema breadcrumbs for V2 (NOT used in V1 routing yet):
  acceptsPooled         Boolean  @default(false)
  pooledMinPercent      Int?
  region                Region?  @relation(fields: [regionId], references: [id])
}

// 3. Routing audit trail (new table)
model RoutingDecision { ... }                          // §7.3

// 4. Order — breadcrumb fields for V2 pooling/buffer
model Order {
  // existing fields...
  pooledBatchId         String?                       // V2 only
  bufferInventoryItemIds String[]                     // V2 only
}
```

### V1.5

```prisma
// Real-time quote caching
model OrderQuote {
  id                  String   @id @default(cuid())
  orderId             String                                    // even pre-confirmation
  routingDecisionId   String
  quoteCents          Int
  validUntil          DateTime                                  // quotes expire to prevent stale-pricing exploits
  acceptedAt          DateTime?
}

// Telemetry collection for V2 flywheel — START STORING NOW even if not consumed
model PartnerServiceOutcome {
  id                       String   @id @default(cuid())
  partnerServiceId         String
  orderPartnerApprovalId   String                               // per PRINT_PRODUCTION_WORKFLOW.md §7.7
  scoreAtAssignment        Float
  lockedToProductionMs     Int?
  productionToShippedMs    Int?
  hadRevision              Boolean  @default(false)
  hadDispute               Boolean  @default(false)
  capturedAt               DateTime @default(now())
  @@index([partnerServiceId, capturedAt])
}
```

### V2

```prisma
// Pooled production batches
model PooledProductionBatch { ... }                    // §10

// Platform-owned neutral inventory
model PlatformInventoryItem {
  id                   String   @id @default(cuid())
  warehousePartnerServiceId String                            // where it's stored
  serviceTypeNeeded    ServiceType                            // typically COPACKING
  description          String                                  // 'Standard 16oz amber bottle'
  unitsAvailable       Int
  unitsReserved        Int      @default(0)
  unitsInbound         Int      @default(0)                   // replenishment pending
  reorderThreshold     Int
  unitCostCents        Int
}

// Creator-level BOM overrides (premium tier)
model OrderBOMOverride { ... }                         // §4.1

// Routing scorecard cache (refreshed nightly)
model PartnerServiceScorecard { ... }                  // §11.1
```

---

## 13. Build sequence

### Phase OR1 — Routing engine V1 (Mode 1 only)

After Design Studio Phase D ships and the post-canvas wizard exists:

1. Schema migration: `ProductTemplateBOM` table + PartnerService capability fields + `RoutingDecision` audit + Order breadcrumbs (no V2 logic, just columns)
2. Admin UI: BOM editor in the existing Product Template admin page (`/admin/products/[id]`)
3. Seed: BOM rows for the 6 starter ProductTemplates
4. `packages/orders/src/orchestration/` module — engine + scoring + framedConsequence + types
5. Integration: post-canvas wizard's Step 2 (Production Options) calls `orchestration.route(input)` and renders the result
6. Audit log: every call writes a RoutingDecision row

### Phase OR2 — Mode 4 polish (V1.5)

7. Real-time quote recalc as creator nudges the quantity slider (debounced)
8. Multi-dimensional consequence display (cheaper / faster / premium options side-by-side)
9. Alternative-spec suggestions (sub-type fallback per §6.1 Layer B)

### Phase OR3 — Telemetry collection (V1.5)

10. `PartnerServiceOutcome` row populated on every order state transition
11. Admin dashboard showing per-partner scorecard (read-only display; not yet feeding back into routing)

### Phase OR4 — Pooling (V2)

12. `PooledProductionBatch` model + lifecycle workflows
13. Time-window scheduling (per-partner batching cadence)
14. Fairness rules + underwriting decision engine per §10
15. Mode 2 surfaces in the wizard as "we'll batch this — expected start: [date]"

### Phase OR5 — Buffer Inventory (V2)

16. `PlatformInventoryItem` + warehouse partner integration
17. Auto-pull logic when graph node can be satisfied from buffer instead of partner-side production
18. Replenishment forecasting + admin replenishment dashboard

### Phase OR6 — Data flywheel activation (V2)

19. `operationalRiskFactor` in scoring switches from static tier-based to dynamic scorecard-based
20. Partner tier-down automation: when reliability index drops below threshold, surface to admin queue (per PLATFORM_SPEC.md partner promotion gates)

### Phase OR7 — Creator-tier underwriting decisions (V2)

21. Per-tier underwriting policies wired (Master = underwrite up to $X/year; Builder = spill-with-breakout-option; Maker = spill)
22. Annual underwriting budget tracking per Master creator
23. Creator-facing UX: "Your premium tier covered the production gap — production starts on time"

---

## 14. Connection points to other docs

- **`DESIGN_STUDIO_REBUILD.md`** §8.1 (post-canvas wizard Step 2) is the primary surface for Mode 1 + Mode 4. The orchestration engine returns the quote that the wizard renders.
- **`PRINT_PRODUCTION_WORKFLOW.md`** §2 per-partner Gate B applies to every node in the production graph. Each graph node creates one `OrderPartnerApproval` row.
- **`PRINT_PRODUCTION_WORKFLOW.md`** §5 capture rule (no payment until all partners approve) extends naturally — when the graph has N nodes, all N must approve.
- **`PLATFORM_SPEC.md`** §Tier 1 (creator tiers Maker/Builder/Master + partner tiers Verified/Trusted/Premier) provides the static tier mapping that V1 scoring uses and the underwriting policies V2 enforces.
- **[[ilaunchify-flavors-as-presets]]** — FlavorPresets sit inside a BOM line. Picking a flavor doesn't change the graph topology; it changes the recipe parameters fed to the manufacturer.
- **[[ilaunchify-markets-and-regions]]** — Region is a routing factor (proximity scoring §7.2) and a hard filter (cross-border routing is V2+).
- **[[ilaunchify-operational-philosophy-v1]]** — operational risk weight in the scoring function is the codification of "operational trust > margin." Sometimes the engine recommends a worse-on-paper graph because the cheaper alternative is operationally risky.

---

## 15. Open questions

These don't gate the V1 build but need resolution before the surfaces that depend on them ship:

1. **Quote validity window.** How long should a routing quote be valid before forcing recalc? Stripe-style "valid for 24 hours"? Partner pricing changes might force re-quote sooner. Recommendation: 24h for direct routing, 1h for any quote within an active pooling window.

2. **BOM versioning.** When admin edits a ProductTemplate's BOM, what happens to in-flight orders? My recommendation: orders snapshot the BOM at routing time into RoutingDecision.candidatesJson (already in §7.3). New orders use the latest BOM.

3. **Region of the WAREHOUSE node.** If creator picks "ship to warehouse" with a specific WAREHOUSE PartnerService, does the engine use that warehouse's region as the destination for proximity scoring? Recommendation: yes. WAREHOUSE node anchors the graph.

4. **Routing for sample / first-run orders.** Should the engine score samples differently than production runs? Samples typically have higher per-unit cost and shorter lead times. Recommendation: yes — `isSampleRun` flag on RoutingInput, leans the weights toward `w_lead` over `w_cost`.

5. **Cross-product orchestration.** When a creator places an order with multiple products in one cart (V1.5+), does the engine optimize each product independently or look for shared partner efficiencies? Recommendation: V1.5 = independent. V2 = shared (e.g. one packaging supplier handles two products in one batch).

6. **Real-time partner capacity.** Does the engine check whether a partner has *current* capacity, or just *declared* capacity? Recommendation: V1 uses declared (PartnerService.maxMonthlyCapacity field). V2 ingests real-time capacity signals from partner MIS webhooks.

7. **Tax / customs / cross-border.** V1 is US-only per [[ilaunchify-markets-and-regions]]. When V1.5 adds Canada and V2 adds EU, the orchestration engine grows tax + customs nodes in the graph. Worth a flag in the BOM for `crossBorderEligible`.

---

## 16. What this document does NOT cover

- File validation / preflight engine — see `PRINT_PRODUCTION_WORKFLOW.md` §1 Layer 2
- Per-partner approval gates — see `PRINT_PRODUCTION_WORKFLOW.md` §2 + §5
- Canvas + design surface — see `DESIGN_STUDIO_REBUILD.md`
- Subscription tier pricing / feature gates — see `PLATFORM_SPEC.md` §Tier 1
- Partner team management — see `PRINT_PRODUCTION_WORKFLOW.md` §2.1-2.7

Each of those docs assumes the orchestration layer exists. This document is the contract they're built against.
