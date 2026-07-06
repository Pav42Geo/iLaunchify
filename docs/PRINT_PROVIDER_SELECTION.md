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

## §8 Build phases + ownership

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
