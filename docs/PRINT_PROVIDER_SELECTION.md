# Print Provider Selection — rating-driven routing + creator choice (Printify model)

**Date:** 2026-07-05. Companion to `docs/FEEDBACK_MODULE.md` (Part 5 supplies the rating engine
this consumes) and `docs/ROUTING_BINDING_MODEL.md` (this extends the binding rules). Treat this
doc with routing-grade care: provider appearance/hiding, binding, cancellation, refund, and
penalty logic all hang off the sourcing signal defined in §2.

## TL;DR

- **Printify's model, confirmed:** providers are ranked by a quality score (their "Printify
  ranking" sort; last-4-weeks Quality / Production Speed / Samples & Shipping sub-scores in the
  tooltip), auto-selection routes to the best-scoring eligible provider, and the merchant can
  override manually. Pavel's read is correct — and it's the right competitive mechanic: ratings
  become the thing printers compete on.
- **We do the same, on our rails:** hard filters decide WHO IS ELIGIBLE (active, Stripe-live,
  capability/die-cut match, no blackout — never rating); the **Bayesian rating** (FEEDBACK_MODULE
  §5.3) decides RANKING; the creator can always pick manually. Mirrors the fc-scorer pattern
  exactly (hard filters → weighted score → rotation band) — we reuse that architecture, including
  a **rotation band** so new printers get exposure and incumbents can't sit on an early lead.
- **The sourcing signal (the "surgical" part):** today "manufacturer prints in-house" is an
  IMPLICIT routing fallback, not a declaration. We make it explicit — `labelingMode` on the
  manufacturing service + optional per-product override — and derive ONE pure function,
  `effectivePrintSourcing()`, that every surface (cards, studio, checkout, routing, cancellation
  policy) consults. No surface ever re-derives it locally.

## §1 Current state (verified in code, 2026-07-05)

`packages/orders/src/routing.ts findRouting()` resolves the print leg in strict order:
1. **Chosen offering** — a `LABEL_PRINTING` service bound via `product.packagingComponents[].partnerOffering` (the component flow's explicit binding).
2. **Legacy die-cut match** — commodity shop over ACTIVE printers with `dieCutSupport` for the template's `dieCutTemplateId` (blackout-excluded).
3. **Owner self-label fallback** — `printSvcId = manufacturer.id`. The common full-service case; an order is never stranded for lack of a separate printer.

`dispatch-planner.ts` then emits one LABEL leg per distinct live decorated-component printer, falling back to findRouting's single leg. **Nothing anywhere records the manufacturer's INTENT** — self-label is what happens when nothing else matched. That ambiguity is exactly what §2 removes.

## §2 The sourcing signal (single source of truth)

```prisma
enum LabelingMode {
  IN_HOUSE          // manufacturer prints/labels everything they make — never show provider cards
  EXTERNAL_ALLOWED  // manufacturer can self-label, but external printers may be chosen (default)
  EXTERNAL_REQUIRED // manufacturer does NOT print — a print partner is mandatory
}
// PartnerService (MANUFACTURING):  labelingMode LabelingMode @default(EXTERNAL_ALLOWED)
// Product: printSourcingMode LabelingMode?  // optional per-product override by the manufacturer
```

- Set in the partner **service profile** (editor card: autosave + FSM + audit, per the
  MANUFACTURER_PRODUCT_BUILDER conventions) and overridable per product in the partner product
  builder ("Who prints this product?"). Changing it is an audited event
  (`LABELING_MODE_CHANGED`) — this is the "event that specifies it".
- **Pure resolver (`@ilaunchify/orders`):**
  `effectivePrintSourcing(product, manufacturerService) → IN_HOUSE | EXTERNAL_ALLOWED | EXTERNAL_REQUIRED`
  (product override wins, else service default). Consumed by: product detail page (show/hide
  cards), Design Studio print spec, checkout review, `findRouting`, cancellation/refund policy,
  admin views. ONE function, unit-tested, no local re-derivations.
- Routing changes: `IN_HOUSE` → skip printer search entirely (fallback #3 becomes the DECLARED
  path, and V1's "collapse to single dispatch when self-labeled" TODO becomes safe to do).
  `EXTERNAL_REQUIRED` + no eligible printer → routing fails LOUDLY at product publish/checkout
  (pre-flight check), never silently self-labels.
- Migration/backfill: existing manufacturers default `EXTERNAL_ALLOWED` (preserves today's
  behavior exactly); onboarding gains the question going forward.

## §3 Provider cards (product detail page, marketing/marketplace)

Rendered ONLY when `effectivePrintSourcing ≠ IN_HOUSE`. Printify-style, non-intrusive:
- **Big score first** (Printify's `★ 9.2` pattern): our 5-star Bayesian display ("★ 4.8 · 23")
  — below min-N, a "New" badge instead. Score popover = last-90-days dimension bars
  (Print / Color / Proofing / Speed — FEEDBACK_MODULE §5.2) mirroring Printify's
  "last 4 weeks performance" tooltip + a "How partner ratings work" link.
- Card row: location flag · price-from (offerings) · avg production time (REAL number — mean
  `productionStartedAt→readyAt` from dispatch state timestamps, last 90d) · print areas/formats ·
  capability chips (Bulk discount / Branded inserts equivalents = our finish + packaging options).
- **Provider Details modal**, tabs fed ENTIRELY from onboarding + service-profile data (no new
  data entry): Profile (company, verified badges, certifications) · Output spec
  (`PartnerPrintOutputSpec`: formats, color space, ICC, TAC, min DPI, bleed, fonts policy) ·
  Die-cut / format support · Production (avg times, capacity windows incl. blackout visibility) ·
  Ratings detail.
- Button: **"Select this provider"** (not "Start designing" — our flow runs product → studio →
  checkout, not provider-first).

## §4 Selection binding (surgical path, end to end)

1. Creator clicks "Select this provider" on the product detail page → writes
   `ProductPrintSelection { productId, creatorUserId, partnerServiceId, createdAt }`
   (creator-scoped — different creators ordering the same catalog product may pick different
   printers; also survives re-orders as their default).
2. **Design Studio print spec** shows the pinned provider (name + score + output-spec constraints
   driving the canvas preflight). *Canvas is Code's hot zone — this indication panel is a
   handoff item.*
3. **Product review + checkout** show the pinned provider on the print line; changing it there
   re-opens the card picker (same component, modal).
4. **`findRouting`** gains step 0: `pinnedPrintServiceId` (from the creator's selection) —
   validated against the SAME hard filters (ACTIVE service+partner, Stripe live, capability/
   die-cut match, no blackout). Valid → bind exactly that provider on the LABEL dispatch.
   Invalid at order time → checkout surfaces it BEFORE payment ("your printer is unavailable —
   pick another or let us route it"), never a silent substitution.
5. **After acceptance**, the normal dispatch FSM owns it. Pinned-provider decline/withdraw does
   NOT auto-reroute: the creator explicitly chose, so reroute needs their approval (notification
   → approve next-best or pick again; existing decline/reroute + refund policies apply
   unchanged). Auto-routed orders keep today's auto-reroute.

## §5 Auto-routing by rating (when the creator doesn't pick)

> **SUPERSEDED 2026-07-06 by `docs/SMART_ROTATION_ENGINE.md`** — the sketch below grew into the
> full admin-controlled engine (RotationPolicy: top-N pool, EQUAL/RANDOM/WEIGHTED_EXACT/
> BEST_ONLY split, new-provider ramp + cap, rating floor, location bias, sticky reorders,
> kill switch, PrintAwardLog). SR-1 (schema + pure engine) BUILT; read that doc, not this §.

Replaces the legacy commodity-shop ordering in fallback #2 (and ranks `EXTERNAL_*` candidates
generally):
- Hard filters (unchanged, never rating-based) → **rank by Bayesian rating score** (+ tie-breakers:
  avg production time, then price) → **rotation band** (fc-scorer pattern): candidates within Δ of
  the top score rotate, so a 4.9 incumbent and a promising 4.7 both see work, and "New" printers
  (min-N not reached) get a seeded exposure share (e.g. 10% of auto-routed volume) — otherwise
  new providers can never earn ratings. Guardrail: providers below a floor (e.g. Bayesian < 3.0
  with N ≥ 10) drop out of AUTO routing (manual selection still allowed) — the competitive
  pressure Pavel wants, with due process (admin alert + partner notification before the gate
  trips; ties into P3 scorecards/penalties).
- All knobs (Δ band, exposure share, floor) admin-gated via the LogisticsSetting-style pattern —
  never hardcoded.

## §6 Co-packers + FC (scope guard)

Co-pack legs stay auto-derived (CARTON/SHIPPER components) — no public cards until a selection
UX exists; their SERVICE-scoped rating (FEEDBACK_MODULE §5.5) surfaces to admin + the partner
now and pre-seeds a future co-packer directory. FC selection already has its own scorer; its
rating becomes one more scorer input later (admin-only display, per Pavel).

**Not to be confused with the print pool:** a co-packer (or manufacturer) that *also* offers a
printing service is still barred from the public print rotation/discovery/RFQ pool by the
main-role gate (§7.3, step 0) — its printing closes its own cycle only. Co-pack/FC public
rotation is a separate, deferred question.

## §7 Capability & Compatibility Model — pairing providers to products (added 2026-07-05)

**The concern (Pavel):** not every printer can print every product — a wrong pairing (a printer
who can't do cans, the wrong box format, an incompatible material) is a platform-level loss:
failed dispatch, refund, penalty, trust damage. Pairing must be capability-driven and impossible
to get wrong by construction.

### 7.1 What ALREADY exists (audited in schema, 2026-07-05 — more than expected)

| Layer | Model | Covers |
|---|---|---|
| Physics matrix | `PackagingDecorationCompatibility` (admin-curated, C8 seed) | which DecorationMethods are physically valid per ContainerCategory (e.g. CAN: DIRECT_PRINT "5k+ bulk-only", PRESSURE_SENSITIVE_LABEL "~250 on-demand", SHRINK_SLEEVE) — partners literally cannot list an impossible combo; the offering picker is filtered by these rows |
| **The pairing tuple** | `PartnerPackagingOffering` | service × packagingType × decorationMethod, with **MOQ, leadTimeDays, pricingTiers (qty breaks), fulfillmentMode (BULK/ON_DEMAND/BOTH), dieline, status** |
| Prepress constraints | `PartnerPrintOutputSpec` | file format, color space, ICC, TAC limit, spot colors + PMS book, white/varnish/foil channels, min DPI, bleed, font policy, dieline delivery |
| Materials | `PartnerServiceSubstrate` | which substrates the printer runs, with per-partner price/lead-time overrides |
| Dielines | `PackagingDieline` + `PartnerServiceDieCut` | structured per-offering prepress spec (dims, bleed, trim/safe boxes, folds, surfaces) + legacy die-cut support used by routing today |
| Finishing | DecorationMethod accents (FOIL_STAMP/EMBOSS/DEBOSS/SPOT_UV) + finish types / `PartnerFinish` | accent capability + per-partner finish offerings |
| Capacity | `blackoutDates` (routing hard-excludes) | temporary capability off-switch |

So the answer to "should partners specify packaging types, labels, materials…" is: **they
already do** — the offering row IS the declaration, and routing already respects the chosen
offering. What's missing is the delta below, plus enforcement depth.

### 7.2 Gaps to close (the additional build)

Industry grounding: MOQ/lead-time are PROCESS-driven (digital from ~50 pcs / 5–14 days; flexo
from hundreds / 7–21 days; offset from thousands / 10–45 days), and food-contact work hinges on
low-migration/food-safe ink systems (FDA 21 CFR 175/176) with documented cure validation —
pre-qualifying suppliers on certifications + documented processes is the procurement norm.

1. **Print process on the offering** — `printProcess enum (DIGITAL | OFFSET | FLEXO | GRAVURE | SCREEN)?`
   per offering. Explains MOQ/lead-time to creators ("why is direct-print 5k units?"), lets the
   compat matrix carry process-level notes, and future-proofs estimating.
2. **Run ceiling** — `maxRunQty Int?` alongside MOQ. Today nothing stops a 100k-unit order
   landing on a small digital shop; eligibility must check `moq ≤ qty ≤ maxRunQty`.
3. **Food-contact compliance flag** — `foodContactSafe Boolean` (+ optional
   `lowMigrationInks Boolean`, cert doc link via the existing partner-document system).
   HARD FILTER for direct-contact packaging (like temp class + hazmat in logistics — never a
   weight). Product side: packaging type/format already knows if it's direct-food-contact.
4. **Dimensional envelope** — `minPrintWidthMm/maxPrintWidthMm` (+height) per offering or on the
   output spec. The dieline's dims must fit the press. Cheap check, prevents ugly failures.
5. **Substrate link on the offering** — offerings today imply substrate via dieline/type; add
   `substrateIds` (or validate offering ↔ `PartnerServiceSubstrate` overlap at listing time) so
   a BOPP-only printer can't take a paper-label job.
6. **Design-vs-spec preflight at BINDING time** — the design's actual demands (spot colors used,
   white ink, accent finishes, DPI of placed assets, dieline dims) validated against
   `PartnerPrintOutputSpec` + offering when the provider is pinned/routed — not discovered at
   proof round 1. Studio preflight = Code's zone (canvas); the pure rule engine is ours.
7. **Capability wizard in partner onboarding** — the offering editor exists; wrap it in a guided
   "what can you print?" flow (type → decoration (matrix-filtered) → process → substrates → MOQ/
   max/lead time → dieline upload → compliance flags) so declarations are complete on day one.
   Incomplete capability rows = service not listable (same gate discipline as verification).
8. **Mismatch telemetry** — every decline with reason CAPABILITY (existing decline reasons) is a
   pairing-model failure; admin Feedback/scorecard views flag which capability dimension was
   missing so the matrix/gaps get fixed, not just the order rerouted.

### 7.3 The eligibility function (one function, layered hard filters)

`eligiblePrintProviders(product, component, qty)` — pure, in `@ilaunchify/orders`, used by cards
(§3), pinning validation (§4), auto-routing (§5), and publish-time pre-flight (§2):
0. **Main role = Print Provider (LOCKED 2026-07-09, Pavel) — the public-pool gate.** Only a
   **pure printer** rotates / is browsable publicly / gets RFQ-broadcast: `PUBLIC`, has
   `LABEL_PRINTING`, and runs **neither** `MANUFACTURING` nor `COPACKING` (warehouse is fine). A
   manufacturer or co-packer that also prints closes its OWN cycle (owner-self bind / private
   nomination) and never takes other partners' public print work. Predicate:
   `isPublicPrintPoolEligible` (`rotation.ts`); enforced in `routing.ts`, `print-coverage.ts`
   (RFQ broadcast), `marketing/print-providers.ts` (discovery), and capability-request claims +
   nav. The owner-self label path (§4) and INVITED_ONLY nomination are unaffected — they are
   deliberate bindings, not the public pool.
1. Physics: (containerCategory × decorationMethod) valid per `PackagingDecorationCompatibility`
2. Offering: ACTIVE `PartnerPackagingOffering` for (packagingType × decorationMethod)
3. Quantity: `moq ≤ qty ≤ maxRunQty`
4. Materials: component substrate ∈ printer's substrates
5. Dieline/dims: dieline available/compatible + dims inside the envelope
6. Compliance: food-contact flag when the packaging demands it (HARD)
7. Design preflight: spot/white/finish/DPI demands ⊆ output spec
8. Ops: service+partner ACTIVE, Stripe live, no blackout
→ then §5 ranks the survivors by Bayesian rating. Rating NEVER compensates for a failed filter.

Each filter failure carries a machine-readable reason — the cards page can show "3 providers
can't print this (2: quantity below MOQ, 1: no shrink-sleeve for cans)" to the creator, and
telemetry (7.2.8) aggregates them.

### 7.4 Boundary clarification (the can example)
Pavel's instinct is right, with a precise split: printing ON a can (DIRECT_PRINT) is a printer
capability (high-MOQ, bulk); PRINTING a label vs APPLYING it are different jobs — application
at fill time belongs to the manufacturer/co-packer (assembly leg), which our component model
already separates (decorated-component provider vs assembly provider). The matrix + offerings
encode exactly this, so a "can" product with PSL decoration pairs a LABEL printer + an applier,
while DIRECT_PRINT pairs only can-capable printers. No new concept needed — just the §7.2
enforcement depth.

## §8 Application Point & Graph Completeness — "the honey problem" (added 2026-07-05)

**The scenario (Pavel):** honey producer declares "I don't do labels" → printer prints them →
creator picks an FC at checkout → labels and unlabeled honey both arrive at the FC → nobody
sticks labels on jars. Unfinished product, platform-level failure.

**The root cause is architectural, and it's already latent in the code:** the manifest addresses
legs from `order.shipTo*` — the ORDER's destination — but a LABEL leg's true destination is
wherever APPLICATION happens, which is a property of the GRAPH, not the order. And "labeling"
today conflates two different capabilities: PRINTING labels and APPLYING them. The honey producer
can't print, but almost certainly CAN apply at fill — those must be declared separately.

Industry grounding: application is canonically the fill/pack node's job (primary/secondary
co-packer applies labels; the orchestration doc's own reference graph says "labels applied at
the co-packer"). Mature 3PLs DO offer labeling/kitting as a value-added service — so "the FC
won't do it" is a per-service capability, not a law of nature. And multi-facility handoffs
(kitting at one site, fulfillment at another) are the known cost/risk driver — exactly why the
graph must minimize and explicitly cost every inter-partner move.

### 8.1 Split the capability (extends §2)
```
// MANUFACTURING service:
labelingMode      LabelingMode      // §2 — can they PRINT (produce decoration)
labelApplication  ApplicationMode   // NEW — can they APPLY at fill: YES | NO (bulk-only shipper)
// COPACKING service: appliesLabels Boolean @default(true)  (application is their core trade)
```
Backfill: `labelApplication = YES` (matches today's implicit self-label behavior).

### 8.1a FC value-added services — declarable job catalog (NEW; audited 2026-07-05: does not exist)
The WAREHOUSE service's L0 block (storage classes, hazmat, fees, fcCertifications, capacity,
receivingSpecJson) has NO value-added declaration today — we add one, following the same
typed-capability + fee pattern L0 established (pickFeeCents/packFeeCents precedent):

```prisma
enum FcVasJobType {
  RELABEL          // apply/replace product labels (the honey-problem rescue)
  KITTING          // combine components into sellable kits
  LIGHT_ASSEMBLY   // simple assembly, no production equipment
  BAGGING_BUNDLING // polybag, shrink-band, multipack banding
  DISPLAY_BUILDS   // retail display assembly
  REWORK           // correction jobs (wrong label, market-specific swap)
}

model FcValueAddedService {
  id / partnerServiceId (WAREHOUSE svc)
  jobType          FcVasJobType
  // For RELABEL: which application methods the floor can run — a steam tunnel
  // (SHRINK_SLEEVE) is real equipment; hand-applying PSL is not.
  labelMethods     DecorationMethod[] // meaningful for RELABEL; [] otherwise
  feeCentsPerUnit  Int
  minUnits         Int      @default(1)
  leadTimeDays     Int      @default(2)
  notes            String?
  status           OfferingStatus @default(DRAFT) // same publish gate as offerings
  @@unique([partnerServiceId, jobType])
}
```
Declared in the partner FC editor (same card conventions: autosave + FSM + audit + admin
verification before ACTIVE — a false RELABEL claim is exactly the platform loss §7 exists to
prevent, so VAS rows get verified like certifications). These rows are what makes resolver
step 3 REAL instead of gated-off: an FC is an eligible application point only with an ACTIVE
RELABEL row whose `labelMethods` cover the component's decoration method — mirroring
`eligiblePrintProviders`, capability-first, never vibes.

### 8.2 The application-point resolver (pure, the "smart sync engine" core)
`resolveApplicationPoint(graph) → nodeId | UNRESOLVED` — for every decorated component, the
application point is the FIRST graph node downstream of decoration that (a) physically holds the
unlabeled goods and (b) declares application capability:
1. Manufacturer with `labelApplication=YES` → labels ship printer→manufacturer, applied at fill.
   (The common case — today's behavior, now explicit.)
2. Else a co-pack node in the graph (`appliesLabels`) → labels ship printer→co-packer; goods
   manufacturer→co-packer; co-packer applies + packs.
3. Else an FC with an ACTIVE `FcValueAddedService` RELABEL row covering the decoration method
   (8.1a) → printer→FC, FC finalizes (+VAS fee quoted into the total). At checkout, the FC
   picker marks qualifying FCs "Can finalize labeling here"; non-qualifying FCs stay pickable
   ONLY when the graph is already finished upstream. **Priority note (Pavel's read, confirmed
   with one nuance):** manufacturer-finalizes is the DEFAULT whenever the manufacturer can apply
   — fewest hops, lowest freight, goods already in hand — and the FC-finalize choice surfaces
   only when the graph NEEDS it (no-apply manufacturer, no co-pack leg) or the creator's chosen
   FC qualifies and they explicitly opt into it (e.g. it's faster). We never route labels to an
   FC "because it's the destination".
4. Else **UNRESOLVED** → the graph is INCOMPLETE. Hard-block: at product PUBLISH (manufacturer
   declared no-apply and no co-pack route exists → product can't be listed with that decoration
   method) and again at CHECKOUT pre-flight (belt + suspenders; also catches capability changes
   between publish and order). Checkout offers the fixes: switch decoration method (e.g.
   DIRECT_PRINT can, printed upstream, no application step), platform inserts a co-pack leg
   (+quoted cost), or creator picks manufacturer-ships-finished (no FC inbound of raw labels).
   NEVER silently proceed — an order that can't terminate in a finished product must be
   unplaceable by construction.
5. Ship-to independence invariant: the creator's FC pick at checkout changes the FINISHED-GOODS
   destination ONLY. Label legs always address the application point. `scopeShipTo` (partner
   packets) already redacts intermediate hops — this slots in as the layer that DECIDES the hops.

`OrderDispatch` gains `shipToNodeId` (application point / next node), the dispatch-planner emits
an inter-partner leg per hop, and the FC leg (packets G2, INBOUND_ASSIGNED) receives FINISHED
goods only — unless step 3 is ever enabled.

### 8.3 Shipping cost model (the smaller question, answered)
Every inter-partner hop is a COSTED leg quoted at checkout (EasyPost rail already prices
partner→destination): printer→applier freight, manufacturer→co-packer, applier→FC/creator.
Creator sees **one Shipping line** in the total-cost summary (his preferred "combine both"),
expandable to the per-hop breakdown ("Labels → Manufacturer $12.40 · Finished goods → FC
$86.10"). Internally each hop stays a separate ledger item (per-partner cost attribution,
refund math, and the multi-facility-handoff cost visibility the industry warns about). Print
cost itself stays a production line item — never blended into shipping.

### 8.4 Other graph-completeness cases the same validator catches
- Variety pack: CARTON components but no assembler and manufacturer can't self-assemble →
  same UNRESOLVED path (assembly-point resolver = the generalized twin of 9.2).
- Shrink sleeves: application needs equipment (steam tunnel) — `labelApplication` can carry
  per-method granularity later (`appliesMethods: DecorationMethod[]`) — a manufacturer may
  apply PSL but not sleeves. V1: boolean + admin matrix note; extend when a real case lands.
- Multi-printer orders (two decorated components, different printers): both label legs address
  the SAME application point — the resolver already yields one node.
- HOLD_AT_MANUFACTURER ship-to + no-apply manufacturer: caught at publish (fix = co-pack leg
  that ships back, or block).
- Buffer-inventory V2 (blank containers + printed labels, PRODUCTION_ORCHESTRATION Mode 3)
  DEPENDS on this resolver — application at co-packer is that whole mode's premise. Building
  8.2 now is a prerequisite investment in the V2 moat, not just a bug fix.

### 8.5 Phase — PS-7 (with a scope guard)

> **STATUS 2026-07-11 (kickoff audit + build, CW):** schema 8.1/8.1a, the pure resolver +
> validator + tests, partner labeling settings, admin VAS verification, and checkout FC-finalize
> offers + creator-billed label hop (PS-3c/3d) were ALREADY BUILT (commit 6908bd09 et al).
> Landed today: pure `planShipmentHops` hop planner + 9 tests (`packages/orders/src/hop-planner.ts`
> — LABELS / GOODS_TRANSFER / FINISHED_GOODS emission, HOLD ship-back, bearer attribution),
> `OrderDispatch.shipToNodeId` (additive, **gates on db:push + db:generate**), and seed gate
> `billing:platform_pays_interpartner_freight` (OFF = creator pays, per the DECIDED bearer).
> Remaining = the [CODE-coordinated] wiring only: see `docs/HANDOFF-TO-CODE-ps7-per-hop-legs.md`
> (createDispatches → validate + plan + ShipmentLeg emission, manifest label-leg addressing,
> publish/checkout gates per the coverage-guard decision).
- **[CW]** `labelApplication`/`appliesLabels` + `FcValueAddedService` model (8.1a) schema +
  backfill (rides the PS-1/PS-6 migration) + partner editor cards (FC VAS card admin-verified
  before ACTIVE)
- **[CW]** Checkout FC picker: "Can finalize labeling here" qualification badge + VAS fee line
  in the total; resolver step 3 consumes ACTIVE VAS rows
- **[CW]** Pure `resolveApplicationPoint` + graph-completeness validator + unit tests (every 8.4
  case) — `@ilaunchify/orders`
- **[CODE-coordinated]** dispatch-planner + manifest: `shipToNodeId`, per-hop legs, publish +
  checkout pre-flight gates (routing/manifest are shared-hot — single-writer handoff per repo rules)
- **[CW]** checkout: one Shipping line + per-hop breakdown; UNRESOLVED fix-it flow copy
- **[PAVEL — DECIDED 2026-07-11]** printer→applier freight bearer: **CREATOR pays by default**
  — the hop is quoted at checkout inside the single Shipping line (per-hop breakdown per 8.3).
  Bearer is **admin-tunable**: new setting `interPartnerFreightBearer = CREATOR (default) |
  PLATFORM` (LogisticsSetting pattern, same family as first-leg margin bps; per-hop-type
  granularity only if a real case demands it). Since each hop is already a separate ledger
  item (8.3), flipping the bearer later is a billing-attribution change, not a routing change.
- **[PAVEL — DECIDED 2026-07-11]** UNRESOLVED fallback: **eliminated as a creator-facing
  checkout flow — no fix-it menu.** "Play smart not hard": the gate moves to PUBLISH and stays
  there via a coverage guard. Generalizes §10 from printing to EVERY dependent service leg:
  1. **Coverage state on the product**: `COVERED` | `COVERED_BY_OVERRIDE` | `COVERAGE_GAP`.
     Publish gate reads this state; on GAP the product shows a capability warning ("Print
     incompatibility — no matched print provider") and cannot go live.
  2. **Admin service-assignment escape hatch**: admin pins a specific service he trusts onto
     the gap → `COVERED_BY_OVERRIDE`, audited (pinned-picks / FC-override pattern).
     Guardrail: override may relax COMMERCIAL/soft parameters only — NEVER physical hard
     filters (decoration method equipment, temp class, hazmat). Those stay hard per the
     locked temp/hazmat-are-filters-never-weights invariant.
  3. **Coverage guard (event-driven)**: any partner capability change (deactivation, cert
     lapse, claim revocation) re-validates affected products; on gap → "ordering paused",
     auto-fire Capability RFQ (PS-8b), notify admin + manufacturer. Coverage loss is caught
     at the event, not at checkout.
  4. **Auto-relist**: admin can queue a gapped product to go live automatically on
     `COVERAGE_RESTORED` (notification already exists in PS-8).
  5. **Checkout pre-flight stays belt-and-suspenders** but its ONLY behavior is block
     ("temporarily unavailable") + flip product to GAP + notify — the creator never sees
     supply-chain repair options (orchestration thesis: hide the graph).
PS-7's validator must land BEFORE PS-3 (manual printer pinning) goes live — pinning a printer
into a graph with no application point would manufacture the honey problem on demand.

## §10 Print Coverage & Capability RFQ — kill UNRESOLVED upstream (added 2026-07-06)

**The decision (Pavel):** there should be no UNRESOLVED case at order time. Match the
manufacturer with a printer who can produce its labels/packaging BEFORE the product activates.
A creator must never design for hours and then hit "we can't execute your order."

**Industry grounding (researched 2026-07-06):**
- **Keychain** (CPG matchmaking; General Mills-backed): AI translates a product description into
  processing + packaging EQUIPMENT REQUIREMENTS, then matches against a categorized capability
  database of 50k+ manufacturers; manufacturers are shown "in-demand products you could produce"
  as inbound demand. The insight: the match runs on a structured requirement graph, and the
  platform PUSHES qualified demand to the supply side.
- **Lumi** (packaging marketplace, Narvar): ONE quote request auto-fans out to every supplier
  whose declared capabilities match; suppliers "receive opportunities that fit their
  capabilities" — no manual brokering.
- **Printify**: capability is claimed at ONBOARDING (application → catalog + pricing + capacity
  → sample quality check → contract); a listing never surfaces a provider who didn't claim it.
  Coverage is guaranteed by construction — that's why their checkout has no UNRESOLVED.

**Our advantage:** we don't need Keychain's AI translation layer — a ProductTemplate already IS
a structured requirement tuple (packagingTypeId + dieline + decorationMethod + substrate family
+ run band + foodContact + envelope), and `eligiblePrintProviders()` (§7) already evaluates it
against offerings deterministically. What's missing is the LIFECYCLE wiring: gate activation on
coverage, and push uncovered specs to the printer pool as claimable requests.

### 10.1 Print Coverage — computed, continuous, gating
`printCoverage(templateId)` = count of DISTINCT ACTIVE printers passing the §7 hard filters for
the template's requirement tuple (ops-gated: partner ACTIVE + Stripe ACTIVE + not blacked out).
- Computed at template submit, at every offering create/verify/deactivate/blackout, and nightly.
- **Activation gate:** a template whose `effectivePrintSourcing != IN_HOUSE` cannot reach
  PUBLISHED with coverage 0. It parks visibly in the admin review queue: "Print coverage: 0 —
  capability request broadcast" (flag on the review item, not a new enum value).
- **Coverage-drop watch:** a PUBLISHED template whose coverage falls to 0 (printer churn,
  blackout, offering unverified) → auto-PAUSE marketplace ordering with honest copy ("printing
  being re-arranged"), notify manufacturer + admins, auto-fire the RFQ (10.2). Creators with
  in-flight designs get a Notification Center email when coverage returns — design work is
  never lost, orders are never taken into a hole.
- Coverage ≥1 is the floor; the dashboard (10.4) flags coverage-1 templates as "fragile" so the
  pool deepens before churn bites.

### 10.2 PrintCapabilityRequest — the claimable RFQ (zero-admin broadcast)
When coverage = 0 (at submit or by drop), the system generates ONE open request per requirement
tuple and broadcasts it to a SMART SHORTLIST automatically:

```prisma
model PrintCapabilityRequest {
  id                  String @id @default(uuid())
  productTemplateId   String // soft FK
  // requirement tuple, denormalized — printers see the spec without template access
  packagingTypeId     String
  dielineId           String?
  decorationMethod    DecorationMethod
  printProcessHint    PrintProcess? // from the §7 physics matrix
  substrateFamily     String?       // family, not exact id — claimers declare their own
  runBandMin          Int
  runBandMax          Int?
  foodContactRequired Boolean @default(false)
  status              CapabilityRequestStatus @default(OPEN) // OPEN|CLAIMED|FULFILLED|EXPIRED
  createdAt/updatedAt/expiresAt
}
model PrintCapabilityClaim {
  id / requestId / partnerServiceId
  status     ClaimStatus @default(SUBMITTED) // SUBMITTED|OFFERING_DRAFTED|VERIFIED|WITHDRAWN
  offeringId String? // the PartnerPackagingOffering the claim produced
  @@unique([requestId, partnerServiceId])
}
```

**Shortlist ranking (smart but deterministic — no admin, no AI):** rank onboarded
LABEL_PRINTING services by adjacency: (a) same decorationMethod on a DIFFERENT packaging type —
strongest signal, they own the press; (b) same packagingType, different method; (c) same
printProcess per the physics matrix; (d) geo proximity to the manufacturer (label-hop freight,
PS-3d); (e) rating (FB-F). Top N (admin-tunable, default 10) get a Notification Center email +
partner-dashboard card: *"A manufacturer on iLaunchify needs shrink-sleeve printing for 500ml
PET jars — you already run shrink sleeve on cans. Claim this job type."* Weekly re-broadcast to
the next band while OPEN; EXPIRED after an admin-tunable window escalates to ops — the ONLY
manual touch in the loop.

**Partial disclosure (per Pavel):** claimers see the requirement spec + dieline + run band +
manufacturer's REGION. NOT creator designs, NOT brand names, NOT manufacturer identity until
the claim verifies. Full pre-approved product detail unlocks post-verification (they need it
for production anyway).

**Claim → offering, zero re-typing:** "I can produce this" pre-fills a DRAFT
PartnerPackagingOffering from the request tuple → printer completes pricing/MOQ/envelope in the
EXISTING §7.2 offering wizard → EXISTING admin verification → ACTIVE → coverage recomputes →
template auto-unparks/resumes → claim FULFILLED → manufacturer + waiting creators notified.

### 10.3 Design Studio guard (inherited)
Because activation gates on coverage, a creator can never START designing an uncoverable
product. The only residual case is a coverage DROP mid-design → ordering pauses with honest
copy, the RFQ machinery is already reopening supply, the creator's work is safe. §8's
UNRESOLVED validator stays as defense-in-depth at Pay — 10.1 makes it structurally unreachable.

### 10.4 Admin Coverage dashboard (v2 admin surface)
KPIs: uncovered templates · fragile (coverage 1) · open RFQs · claims awaiting verification ·
median time-to-coverage. Rows deep-link to template + claim list. Admin's only jobs: verify
offerings (existing flow) and optionally nudge/extend an expiring request. Detection,
shortlisting, broadcast, re-broadcast, unpark — all automatic.

### 10.5 Execution checklist (PS-8, started 2026-07-06)
- **PS-8a — schema + engines** · CODE COMPLETE 2026-07-06 (CW); migration pending Pavel
  - [x] Schema drafted in packages/db/prisma/schema.prisma (UNMIGRATED — no code references
    it yet): `CapabilityRequestStatus` + `CapabilityClaimStatus` enums,
    `PrintCapabilityRequest` (denormalized tuple, `notifiedServiceIds` broadcast ledger,
    unique templateId+packagingTypeId), `PrintCapabilityClaim` (unique request+service,
    offeringId link)
  - [x] `packages/orders/src/print-coverage.ts`: `computeTemplatePrintCoverage(templateId)` —
    template → manufacturerServiceId → effectivePrintSourcing (IN_HOUSE = not applicable) →
    template packagingTypeIds (via packagingSystems → packagingSystem.packagingTypeId) →
    DISTINCT ops-gated printers with an ACTIVE offering on those types (svc+partner ACTIVE,
    Stripe ACTIVE, no live blackout). Mirrors apps/marketing/src/lib/print-providers.ts
    candidate derivation. Fails soft to `{applicable:false}`. Returns `uncovered`/`fragile`
    flags + `manufacturerRegion` (partner.primaryRegion.code) for the tuple. Also
    `buildCapabilityTuples()` (one tuple per packaging type — matches the RFQ unique key) and
    `loadCapabilityShortlist()` (prisma pool loader → the pure ranker below).
  - [x] Pure adjacency shortlist `rankCapabilityShortlist(candidates, tuple)` in
    `capability-shortlist.ts` — (a) same decorationMethod on a DIFFERENT packagingType >
    (b) same packagingType different method > (c) same printProcess (physics matrix) >
    (d) geo (manufacturerRegion match) > (e) rating. Spaced-weight score = faithful
    lexicographic key; serviceId final tiebreak (fully deterministic). 11 compiled-node tests
    pass (priority ladder, null-method, no-adjacency long-shots, limit, rating clamp).
  - [x] Audit entity types: 'PrintCapabilityRequest', 'PrintCapabilityClaim'
    (packages/audit/src/types.ts)
  - [ ] **[PAVEL]** Migration handoff (db:push + generate + .next clear) — the drafted enums +
    models are still UNMIGRATED. Nothing in PS-8a references them at runtime yet, so the code
    compiles and ships without the migration; PS-8b (RFQ create/broadcast) is the first
    consumer and MUST NOT merge before the push.
- **PS-8b — gate + broadcast** · CODE COMPLETE 2026-07-06 (CW); migration pending Pavel
  - [x] `PARTNER_CAPABILITY_RFQ` NotificationEvent (schema enum + 4-file registry:
    categories='reminders', payload-required, template-tokens, templates TemplateData +
    partner-copy switch case — partial disclosure: spec/run-band/region only, no designs).
  - [x] `broadcastCapabilityRequestsForTemplate(templateId)` in packages/orders/capability-rfq.ts
    — coverage→uncovered→upsert OPEN request per packaging type→rank next un-notified band
    (loadCapabilityShortlist, exclude notifiedServiceIds)→dispatchToPartnerService→push ledger→
    system audit. Idempotent (ledger walks the next band); coverage≥1 closes lingering requests
    FULFILLED. Fails soft (never aborts a publish/cron). dispatch via dynamic import (no cycle).
  - [x] Publish gate: `approveProductTemplate` blocks PUBLISHED when coverage applicable &&
    uncovered, auto-broadcasts the RFQ, audits PRODUCT_TEMPLATE_PUBLISH_BLOCKED_NO_COVERAGE,
    returns honest copy. IN_HOUSE / covered templates pass straight through.
  - [x] Cron sweep `apps/admin/api/cron/print-coverage` (+ worker `lib/print-coverage-worker.ts`,
    CRON_SECRET, vercel.json `0 9 * * *`): (1) coverage-drop watch — PUBLISHED non-IN_HOUSE →
    coverage 0 → auto-PAUSE + RFQ + audit; (2) weekly re-broadcast — OPEN requests idle ≥7d walk
    the next band; (3) expiry — past-window OPEN → EXPIRED (ops escalation).
  - Follow-ups (not blocking): event-driven coverage-drop hook on offering deactivate/blackout
    (nightly sweep is the safety net today); manufacturer/admin "paused for coverage"
    notification (printers ARE notified via the RFQ — the recruitment path); real partner claim
    route for the RFQ link (currently `/dashboard`, PS-8c swaps it in).
  - [ ] **[PAVEL]** Migration: `pnpm db:push && pnpm db:generate && rm -rf apps/*/.next`. This
    migration lands BOTH the PS-8a tables (PrintCapabilityRequest/Claim) AND the new
    `PARTNER_CAPABILITY_RFQ` enum value. Code was typechecked against a LOCALLY-patched client
    (sandbox can't regenerate — Linux, no engine); your regenerate is the real source of truth.
- **PS-8c — partner claim flow** · CODE COMPLETE 2026-07-06 (CW); migration pending Pavel
  - [x] Partner capability inbox `/capability-requests` (LABEL_PRINTING role-nav entry, Megaphone):
    lists OPEN requests the service was shortlisted for (notifiedServiceIds `has`) and hasn't
    claimed; partial disclosure (packaging label + run band + region + compatible decorations
    from the physics matrix — no designs/brand/manufacturer). `data.ts` + client claim card.
  - [x] `claimCapabilityRequest(requestId, decorationMethod)` — validates OPEN + shortlisted +
    physics-compatible → find-or-create DRAFT PartnerPackagingOffering (service × type ×
    decoration, zero re-typing) → upsert claim OFFERING_DRAFTED + offeringId → request CLAIMED →
    audit → redirect into the EXISTING §7.2 offering editor to finish pricing/MOQ.
  - [x] Verification = self-activation (offerings are partner-activated; there is NO admin
    offering-review step — the doc's "admin verification" was aspirational). Hook
    `resolveCapabilityClaimOnOfferingActivated(offeringId)` runs on every offering→ACTIVE
    transition (create/update/setOfferingStatus): claim VERIFIED → coverage recompute (request
    FULFILLED via the ≥1 path) → PAUSED-for-coverage template re-listed PUBLISHED. Fail-soft.
  - Follow-ups (not blocking): manufacturer + waiting-creator "coverage restored" notification
    (structural close is done; the notify is unbuilt); a distinct "paused reason" flag so
    auto-unpark can't re-list a template an admin paused for an unrelated reason (V1 re-lists
    any PAUSED template whose coverage returns via the claim path — acceptable at V1 volume).
  - [ ] **[PAVEL]** rides the SAME db:push as PS-8a/PS-8b (no new schema — reuses the models +
    enum). `pnpm db:push && pnpm db:generate && rm -rf apps/*/.next`.
- **PS-8d — admin Coverage dashboard** · CODE COMPLETE 2026-07-06 (CW); migration pending Pavel
  - [x] `/print-coverage` v2 admin surface (Inbox group, `reviews:write`): AdminPageHeader hero +
    5-KPI strip (uncovered templates · open RFQs · claims awaiting · paused-for-coverage ·
    median time-to-coverage) + capability-requests table (template deep-link, packaging, status
    chip, claim/notified counts, region, age). Cheap loader — derives from request/claim rows +
    a PAUSED count; no per-template coverage scan on load.
  - [x] Row nudges (`reviews:write`, audited): **Re-broadcast** (→ next printer band now) +
    **Extend** (+14d, reopens EXPIRED). Everything else stays automatic.
  - Note: swapped §10.4's "fragile (coverage 1)" KPI for "paused for coverage" — exact + cheap;
    a true coverage-1 count needs a denormalized `printCoverage` column (follow-up), since
    scanning every template's coverage on dashboard load doesn't scale.
  - [ ] **[CODE — Studio/checkout, canvas hot zone]** "printing being re-arranged" guard copy on
    a coverage-dropped template mid-design. Trigger: `ProductTemplate.status === 'PAUSED'` with an
    OPEN/CLAIMED `PrintCapabilityRequest` for it. Copy: *"Printing for this product is being
    re-arranged — you can keep designing, but ordering is paused for a moment while we line up a
    printer. We'll email you the moment it's back."* Placement is Studio/checkout (Code's zone) —
    §10.1 makes this structurally rare (activation gates on coverage), so it's defense-in-depth;
    the §8 UNRESOLVED validator at Pay is the hard backstop. Marketplace detail already drops
    PAUSED templates from listings (loader filters `status==='PUBLISHED'`).
  - [ ] **[PAVEL]** rides the SAME db:push as PS-8a/8b/8c (no new schema).
- **PS-8 follow-up — coverage-restored loop** · CODE COMPLETE 2026-07-06 (CW)
  - [x] `recoverTemplateCoverage(templateId)` (packages/orders/capability-rfq.ts) — the SINGLE
    unpark path: recompute coverage → close requests FULFILLED → re-list a PAUSED-for-coverage
    template (PUBLISHED) → notify. `resolveCapabilityClaimOnOfferingActivated` now delegates to it
    (de-duped its inline unpark).
  - [x] Fixes a real gap: coverage restored by a NON-claim offering activation (any printer adding
    a covering offering) previously left the template stuck PAUSED — the cron never un-paused. New
    **recovery pass (step 0)** in the print-coverage cron sweeps PAUSED-for-coverage templates
    (those with a live OPEN/CLAIMED request) through `recoverTemplateCoverage`, so ANY path back to
    coverage re-lists the product. Guarded to templates with a live request → never re-lists an
    admin's unrelated manual pause.
  - [x] `COVERAGE_RESTORED` NotificationEvent (schema enum + 4-file registry, category `orders`),
    ONE event with role-branched copy: manufacturer ("back on the marketplace") vs waiting creators
    ("available again — finish + order"). Waiting creators = in-flight (DRAFT/IN_REVIEW/COMPLIANT)
    Products on the template → Brand → CreatorProfile.userId. Fail-soft.
  - [ ] **[PAVEL]** the `COVERAGE_RESTORED` enum value rides the SAME db:push.
- **PS-8 follow-up — denormalized coverage cache** · CODE COMPLETE 2026-07-06 (CW)
  - [x] `ProductTemplate.printCoverage Int?` + `printCoverageAt DateTime?` — cached count of
    ops-gated printers (null = IN_HOUSE / not computed). `recomputeTemplateCoverage(templateId)`
    computes via `computeTemplatePrintCoverage` + persists (cast-guarded write until the column
    lands on the client — getOrderSettings pre-push pattern).
  - [x] Kept fresh at the points that already compute coverage: `broadcastCapabilityRequestsForTemplate`
    (every publish-gate / recovery / re-broadcast), admin approve gate, and the nightly cron
    drop-watch (all PUBLISHED). Publish GATE still computes live — the cache is for reads, not the gate.
  - [x] Admin dashboard now exact + cheap: **"fragile" = `count(printCoverage = 1)`** (replaced the
    PAUSED-count proxy), uncovered = `count(printCoverage = 0)` — both simple counts, no per-template
    scan. 5 KPIs now match §10.4 (uncovered · fragile · open RFQs · claims awaiting · median).
  - Staleness: an offering change that triggers no broadcast (e.g. a printer adds a covering
    offering to an already-covered template) refreshes the cache only at the nightly cron — fine
    for a dashboard KPI; the live gate is unaffected.
  - [ ] **[PAVEL]** `printCoverage`/`printCoverageAt` columns ride the SAME db:push; after
    `db:generate` the cast-guards in print-coverage.ts + print-coverage/data.ts can be de-cast.

## §9 Build phases + ownership

- **PS-1** `labelingMode` + product override + `effectivePrintSourcing()` + backfill + partner
  editor card. **[CW schema/engine + editor card via partner-editor-card-builder conventions; PAVEL migrate]**
- **PS-2** Provider cards + Details modal + score popover on product detail (read-only — no
  binding yet; "Select" hidden behind a flag). **[CW]**
- **PS-3** Selection binding: `ProductPrintSelection` + checkout surfacing + `findRouting` step 0
  + pinned-reroute approval flow. **[CW builds; routing.ts + checkout touchpoints coordinated
  with Code — announce single-writer per repo rules]** Studio print-spec indication: **[CODE
  (canvas hot zone), spec handed off]**
- **PS-4** Rating-driven auto-ranking + rotation band + floor gate (needs FB-F live + some rating
  volume; cards meanwhile show "New"). **[CW]**
- **PS-5** Failure-mode polish: publish-time pre-flight for EXTERNAL_REQUIRED, cancellation/
  refund copy, penalty/legal hooks per PLATFORM_SPEC. **[CW + PAVEL policy sign-off]**

- **PS-6** Capability & compatibility hardening (§7): offering gains `printProcess` /
  `maxRunQty` / `foodContactSafe` / dimensional envelope / substrate validation (additive schema);
  `eligiblePrintProviders()` pure engine + machine-readable failure reasons; capability wizard in
  partner onboarding; design-vs-spec preflight rules (pure engine **[CW]**, Studio preflight
  UI **[CODE — canvas]**); mismatch telemetry into admin. **[CW + PAVEL migrate]**
  PS-6 schema ships in the SAME migration as PS-1; the eligibility engine must exist BEFORE PS-2
  renders cards (cards without capability filtering would show wrong providers — the exact loss
  scenario this section prevents).

**Sequencing vs the feedback module (decision):** ratings engine first (FB-A/B/F — one
migration), reviews (FB-G) with it, THEN PS-1/PS-6 (sourcing signal + eligibility engine,
one migration), PS-2 cards on top, PS-3 binding next, PS-4 auto-ranking last once ratings flow.
Rationale: auto-ranking without real ratings would be ranking noise; capability filtering must
precede any card rendering; cards + manual selection deliver creator value immediately and START
generating the rating volume PS-4 needs.

## §11 Capability-constrained rotation (added 2026-07-15, Pavel)

**Goal:** only a printer that can ACTUALLY produce a specific product's package / label / die-line
is eligible to rotate for it. This amends §5 (auto-routing), §7 (capability model), and §10
(coverage / RFQ).

**Decisions (Pavel 2026-07-15):**
- **D1: rotation is a FIRST-CLASS path.** Products routinely leave the print leg OPEN for rotation;
  the config-time offering pin (`PackagingComponent.partnerOfferingId`) becomes OPTIONAL, not the
  norm. Capability-filtered rotation is therefore load-bearing, not a legacy fallback.
- **D2: hard filters = the core §7.3 set PLUS finishes/accent decorations PLUS color-process depth.**
  A printer failing ANY is excluded from the pool (rating never rescues, same discipline as §7.3).
- **D3: zero eligible printers = BLOCK PUBLISH + fire the Capability RFQ (§10).** A product cannot
  publish without live print coverage; the already-built PS-8b RFQ recruits a capable printer. Ties
  into the coverage guard (no UNRESOLVED).

### 11.1 The core finding and the seam

`eligiblePrintProviders(product, component, qty)` (the §7.3 engine) ALREADY EXISTS, is pure, and is
unit-tested in `packages/orders/src/print-eligibility.ts`. It is NOT called in the live routing
path. Today `findRouting` builds its rotation pool at `routing.ts:356-415` with only a coarse
filter: `dieCutSupport: { some: { dieCutTemplateId } }` + `moqMin` + ops/blackout + public-pool.
It ignores offering existence, `maxRunQty`, `foodContactSafe`, `substrateIds`, the print envelope,
finishes, and color depth. So a printer with the right die-cut shape but wrong run size / inks /
substrate / finish can currently win rotation.

**The seam is narrow and additive:** replace the pool builder at `routing.ts:356-415` with a call
to `eligiblePrintProviders`, then feed the survivors into the EXISTING rotation lottery
(`rotatePrintShop` -> `selectRotatingProvider`) exactly as `rotationEligible` does today. Sticky,
new-provider ramp, split modes, and `isPublicPrintPoolEligible` all stay untouched. Two glue
resolvers are the only new building blocks (11.4).

### 11.2 How a PRINTER declares capability (answers "how printers say what they can print")

Mostly exists on `PartnerPackagingOffering` (`service x packagingType x decorationMethod`):
`printProcess`, `moq` / `maxRunQty`, `foodContactSafe`, print envelope
(`min/maxPrintWidth/HeightMm`), bound `dieline`; plus service-level `PartnerServiceSubstrate`,
`PartnerServiceDieCut`, finishes via `PartnerFinish` (`service x finishType`), and prepress
`PartnerPrintOutputSpec` (`colorSpace`, `spotColorsAccepted`, `spotColorLibrary`, DPI, bleed).

Additions needed:
- **`substrateIds` picker in the offering editor.** The field exists in schema + engine but has NO
  UI input (`OfferingForm.tsx`). Add it so a BOPP-only printer can decline a paper-label job.
- **Color-process depth (D2).** Add `maxSpotColors Int?` and `whiteInk Boolean` (and optionally an
  `ogv`/extended-gamut flag) to `PartnerPrintOutputSpec`; `spotColorsAccepted` alone is too coarse.
- **Finishes are already declarable** via `PartnerFinish`; no new model, just wire them into the
  engine (11.4, filter 9).
- **Retire the dead "Print specs" JSON** (`ServiceEditors.tsx` service-level processes/colors/
  finishes/maxArea): nothing reads it, so it lies to partners. Fold anything real into the offering
  + output spec, then remove the input.
- **Capability wizard (§7.2.7):** wrap the offering editor in a guided "what can you print?" flow so
  declarations are complete on day one; an incomplete capability row makes the service non-listable.

### 11.3 How a MANUFACTURER declares the requirement (answers "how they specify the product")

Exists structurally: per product the `PackagingComponent` carries `packagingType`,
`decorationMethod`, resolved `dieline`; `PackagingType` carries `containerCategory` + food-contact
signals; `AccentDecoration` (`component x decorationMethod`, optional `partnerFinishId`) carries
required finishes; the design (Studio) carries the actual color demands (spot count, white ink,
placed-asset DPI).

Gap: nothing assembles these into the `PrintJobRequirements` the engine consumes. That resolver is
the missing manufacturer-side glue (11.4). No new author-time UI is required for the core; the
manufacturer already sets packaging type, decoration, dieline, and finishes in the packaging
builder. The only NEW author-side demand is COLOR: the design's spot-color count / white-ink need
must be extractable (Studio = Code's zone) to feed filter 10.

### 11.4 How they MATCH (answers "how they match to printer capabilities")

Two pure glue resolvers in `@ilaunchify/orders`, then extend the engine:
1. **`resolvePrintJobRequirements(component)` -> `PrintJobRequirements`**: from `PackagingComponent`
   + `PackagingType.containerCategory` + `PackagingDieline` dims + labeling-type -> food-contact +
   `AccentDecoration[]` -> required finishes + design -> color demands.
2. **`loadPrintProviderCandidates(requirements)` -> `PrintProviderCandidate[]`**: assemble each
   pure-printer's ACTIVE offering for the `(packagingType x decorationMethod)`, its
   `PartnerServiceSubstrate` ids, `PartnerFinish` set, and `PartnerPrintOutputSpec`.
3. **Extend `eligiblePrintProviders`** with two new HARD filters (per D2), keeping the fail-reason
   discipline:
   - **Filter 9 (finishes):** every `AccentDecoration.decorationMethod` / finishType the component
     needs is in the printer's `PartnerFinish` set. Fail reason `MISSING_FINISH`.
   - **Filter 10 (color depth):** the design's spot-color count <= printer `maxSpotColors`, and if
     the design needs white ink the printer's `whiteInk = true`; spot demands respect
     `spotColorsAccepted`. Fail reason `COLOR_UNSUPPORTED`.

`eligiblePrintProviders` then returns the eligible set; `findRouting` feeds it into rotation. The
engine stays a hard binary filter; rating still ranks only survivors.

### 11.5 First-class rotation implications (D1)

- The offering pin (`partnerOfferingId`) becomes an OPTIONAL creator/manufacturer choice, not the
  default. When absent, rotation over the capable pool is the primary selection path.
- `findRouting` precedence stays: nomination -> creator pin -> chosen offering -> **capability-
  filtered rotation** (now the main branch, no longer gated on legacy `Template.dieCutTemplateId`).
- The requirements resolver must work off the NEW `PackagingComponent` model, not the legacy
  `Template.dieCutTemplateId`, so newly-built (componentized) products reach rotation correctly.

### 11.6 Zero-match handling (D3)

- `printCoverage(templateId)` (§10.1) MUST use the FULL `eligiblePrintProviders` engine, not its
  current lighter filter (`print-coverage.ts:106-129` only overlaps packagingType). Coverage =
  count of DISTINCT pure-printers passing ALL hard filters (incl. 9 + 10).
- Coverage 0 -> the product cannot publish (Studio guard §10.3 + coverage guard, no UNRESOLVED),
  and the Capability RFQ (PS-8b `broadcastCapabilityRequestsForTemplate`) fires to recruit a
  capable printer. On a claim, `COVERAGE_RESTORED` re-lists the product (already built).
- Owner-self-label (§4) remains the deliberate binding for non-food domains with no separate
  printer; it is NOT the public rotation pool and is unaffected.

### 11.7 Build phases (PS-9)

- **PS-9a (core wiring):** `resolvePrintJobRequirements` + `loadPrintProviderCandidates`; wire
  `eligiblePrintProviders` into the `findRouting` rotation pool (replace `routing.ts:356-415`);
  pure-suite pins. No schema. This alone delivers "only capable printers rotate" for the existing
  8 filters.
- **PS-9b (finishes + color, D2):** filters 9 + 10; add `maxSpotColors`/`whiteInk` to
  `PartnerPrintOutputSpec` (additive migration); finish-match reads existing `PartnerFinish` /
  `AccentDecoration`. Studio must expose the design's color demands (Code coordination).
- **PS-9c (declaration UX):** `substrateIds` offering picker; retire the dead service-level "Print
  specs" JSON; capability wizard (§7.2.7) + non-listable-until-complete gate.
- **PS-9d (coverage + zero-match, D3):** point `printCoverage` at the full engine; publish gate +
  Capability RFQ on coverage 0 (reuse PS-8b/§10). Denormalized coverage cache already exists.
- **PS-9e (telemetry, §7.2.8):** aggregate CAPABILITY declines by which filter failed, into the
  admin scorecard, so gaps get fixed not just rerouted.

### 11.8 Risks / edge cases

- **Pool collapse on strict filters.** First-class rotation + 10 hard filters can empty pools for
  niche jobs; D3 (RFQ) is the pressure valve, but watch coverage metrics as filters tighten. Ship
  PS-9a first and measure before adding 9 + 10.
- **Color demands depend on Studio.** Filter 10 is only as good as the design-demand extraction;
  until Studio emits spot-count / white-ink, filter 10 is permissive (undeclared = pass), same as
  today's preflight filter 7.
- **Legacy vs componentized products.** The requirements resolver targets `PackagingComponent`;
  legacy `Template.dieCutTemplateId`-only products keep the coarse path until backfilled.
- **Do not double-count main-role.** Filter 0 (`isPublicPrintPoolEligible`) already bars
  MFR/COPACK from the public pool; keep it as the first gate so owner-self and nomination bindings
  are never swept into rotation.

### 11.9 MOQ compatibility: print pieces vs product pieces (added 2026-07-15, Pavel)

**The problem.** Today filter 3 (`print-eligibility.ts:143-145`) compares the printer's `moq` /
`maxRunQty` against `job.quantity` = the PRODUCT order quantity, assuming 1 label = 1 product unit.
Real CPG breaks that assumption three ways: (a) a product can consume more than one printed piece
(box + inner label + tamper seal), (b) presses run OVERAGE (5-10% extra to cover fill-line
spoilage), and (c) print MOQ is press-driven (digital from ~50, offset from thousands) and diverges
from the fill-line MOQ (`ProductDefaults.moqMin`, default 500). So the print run needed is NOT the
order size, and the two MOQs are genuinely independent.

**Decision (D4, Pavel 2026-07-15): raise the order minimum.** When the needed print quantity is
below every capable printer's MOQ, we do NOT overprint by default. Instead we compute a single
**effective minimum order quantity** for the product (the binding constraint across all legs) and
surface / enforce it at checkout, so the creator sees "minimum for this product is X units" up
front instead of hitting a mid-order failure. Overprint-and-store (a label buffer drawn down over
reorders) is the natural V2 extension (ties to the pooling/buffer moat) and is explicitly DEFERRED;
scrap-the-surplus overprint is rejected (wasteful).

**Decision: model the real print quantity now.** Add:
- `PackagingComponent.piecesPerUnit Int @default(1)` — how many of THIS printed piece a single
  finished product consumes.
- An `overagePct` default (platform setting, optionally per domain / packaging type; industry
  norm 5-10%). Printed pieces provision spoilage; the manufacturer's fill leg EXPECTS the extra.

**Derived quantities (pure, in the §11.4 requirements resolver):**
```
printQty(component)      = ceil( productQty * piecesPerUnit_c * (1 + overagePct) )
```
Filter 3 compares `printQty(component)` (NOT the raw product qty) to the printer's `moq` /
`maxRunQty`, per label SKU. This alone makes capability-rotation correctly EXCLUDE printers whose
floor is too high, and drives the coverage/RFQ path (D3) when none fit.

**Effective order window (surfaced + enforced at checkout):**
```
minProductQtyForPrinter(c, p) = ceil( p.moq / (piecesPerUnit_c * (1 + overagePct)) )
minProductQtyForComponent(c)  = min over CAPABLE printers p of minProductQtyForPrinter(c, p)
effectiveMinOrderQty          = max( manufacturingMOQ,
                                     max over components c of minProductQtyForComponent(c) )
effectiveMaxOrderQty          = min( manufacturingMax,
                                     min over components c of
                                       floor( bestPrinterMaxRun_c / (piecesPerUnit_c*(1+overage)) ) )
```
The creator's quantity must fall in `[effectiveMinOrderQty, effectiveMaxOrderQty]`. Below the min:
block with a clear "raise to X" message (the binding leg named). Above the max: only offset-class
printers qualify (filter 3 already excludes low-max shops); if none, coverage/RFQ (D3).

**Variety packs / multi-component.** Each distinct label is its own print SKU with its own
`printQty` (pack count times that flavor's fill share) and its own MOQ check; the WORST-ratio SKU
sets the binding `effectiveMinOrderQty`. Reuses the existing multi-flavor lead-time pattern
(`resolveMultiFlavorLeadDays`).

**Where it plugs in.** The requirements resolver (§11.4.1) emits `printQty` per component; filter 3
consumes it; a small `resolveEffectiveOrderWindow(product)` (pure) computes the min/max for the
product-detail configurator + checkout gate. Additive schema only (`piecesPerUnit`, an `overagePct`
setting). Folds into **PS-9a** as its MOQ sub-phase; no new migration beyond the two fields.

**Edge cases.** Overage labels not consumed in production are spoilage buffer in v1 (no inventory),
which sets up the V2 label-buffer cleanly. A per-component printer that fits the shape but not the
`printQty` window is simply excluded by filter 3 (no special case). Manufacturing MOQ can still be
the binding constraint, in which case print MOQ is moot and the effective min is the fill floor.
