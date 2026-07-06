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

## §7 Build phases + ownership

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

**Sequencing vs the feedback module (decision):** ratings engine first (FB-A/B/F — one
migration), reviews (FB-G) with it, THEN PS-1/PS-2 (they don't need rating volume), PS-3 next,
PS-4 last once ratings flow. Rationale: auto-ranking without real ratings would be ranking noise;
cards + manual selection deliver creator value immediately and START generating the rating volume
PS-4 needs.
