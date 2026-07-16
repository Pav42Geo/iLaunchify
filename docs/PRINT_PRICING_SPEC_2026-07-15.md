# Print Pricing & Quote: how a printer's real economics reach the creator cost and their own payout

**Added 2026-07-15 (Pavel).** Companion to `PRINT_PROVIDER_SELECTION.md` §11 (capability-constrained
rotation). §11 answers "WHICH printers may run this job"; this doc answers "WHAT does it cost, who
declared that, and where does the money land." Origin: a full code trace on 2026-07-15 found that a
printer's declared price reaches NEITHER the creator's charge NOR the printer's payout.

**UX contract:** `design/print-service-builder-prototype.html` (the Print Service Builder, mirroring
the manufacturer's Add Product builder: Basics -> Your presses -> What you can print -> Finishes &
prepress -> Pricing -> Review & publish). Its Step 5 runs the real PrintTalk maths live: with a
digital curve (100 @ $45.00 + $0.35/unit, max 20k) and a flexo curve (2,500 @ $3,300.00 + $0.08/unit,
max 250k) the crossover lands at **11,444 pieces**, which is DERIVED from the two curves and happens
to match the trade-press break-even (Apex: ~11,000 linear ft). Nobody typed 11,444. That is the whole
argument for per-process pricing in one interaction. §3.5 is the gap list that prototype surfaced.

## §0 Decisions (Pavel 2026-07-15)

- **D-P0: the estimate/charge divergence is a P0 correctness fix, done FIRST and standalone**, before
  any pricing build.
- **D-P1: v1 lets a printer declare all four:** per-process price curves (+ UI), finishes pricing,
  order-value floor + quote-required, die-cut / substrate surcharges.
- **D-P2: admin curation is HYBRID.** The capability engine computes the eligible set; admin may
  BLOCK a printer per template (always) or FORCE-INCLUDE one (audited, with reason), but a
  force-include may NEVER bypass a hard compliance gate (food-contact). Rotation pool =
  `engine-eligible - admin-blocked + admin-forced`. Matches the locked "admin only subtracts" idiom
  (Partner Access console) and nomination's governed override.

## §1 Current state (traced in code 2026-07-15, this is the problem statement)

**A printer can edit exactly one price field:** `PartnerPackagingOffering.pricingTiers` (flat
per-unit tiers) at `OfferingForm.tsx:487-510`, plus `moq` / `leadTimeDays`. That is the entire
surface.

**Everything else is schema-only or literally unwritable:**
- `PartnerFinish` (`schema.prisma:2475-2517`) models setup fee, per-unit, per-area, per-object,
  per-color, tiers, `moqMin`, `maxCoveragePct`. It has **ZERO create/update/upsert sites repo-wide**.
  The table can never hold a row, so **finish cost is structurally always $0** (`cart-actions.ts:600`
  faithfully reads an empty set).
- `PartnerServiceDieCut.surchargeCents`, `PartnerServiceSubstrate.perUnitCostCents`,
  `PartnerServicePackagingMaterial.perUnitCostCents`, `AccentDecoration.surchargePerUnit`: never
  written (onboarding writes IDs only at `onboarding/actions.ts:259-277`), never read. Checkout uses
  the PLATFORM `Substrate.baseUnitCostCents`, not the partner's override.
- **No setup / plate / makeready fee exists for a printer at all. No per-order fee. No freight.**
- `PartnerCommercialTerms` carries no rates (contract plumbing only).

**The charge ignores the printer entirely:**
```ts
// cart-actions.ts:609-617 : what the creator is ACTUALLY charged
const labelUnitCents = 8 + (substrate?.baseUnitCostCents ?? 0)   // 8 cents, HARDCODED
```
The printer's `pricingTiers` appear ONLY in a display estimate (`estimateProductionCost`,
`production-actions.ts:462/534`) and are dropped before `placeOrder`.

**The payout ignores it too:**
```ts
// dispatch-planner.ts:88-99 : the printer's ENTIRE payout
printProviderCostCents: Math.floor(total * 0.08),   // 8% of the hardcoded 8-cent anchor
```
Its own docstring concedes: "V1 uses naive percentages ... V1.5+ pulls real per-component pricing
from the partner profile." `Transfer.amountCents = dispatch.costCents` verbatim
(`orders/[dispatchId]/actions.ts:674`), so the synthetic number is what actually moves money.

**FOUR divergent price computations exist**, none authoritative: marketplace PDP
(`marketing/lib/pricing.ts:472`, `manufacturerCents + platformFee`), configurator (`quote.ts:86`),
checkout estimate (`production-actions.ts:462`), and the real charge (`cart-actions.ts:617`).

**Two live bugs (independent of this feature):**
1. **The summary lies.** `OrderSummary.tsx:150-165` shows "Decoration" and "Component upgrades" line
   items that `cart-actions.ts:617` never charges; "Subscription savings" (`:171`) is a pure
   client-side illusion with no counterpart in `placeOrder`; the PDP promises
   `manufacturerCents + fee` while the till charges `8c + substrate + packaging`.
2. **Fee SSOT violation** (against CLAUDE.md): the estimate reads `PlatformFeeConfig.baseRateBp`
   (`production-actions.ts:576`), the charge uses `resolveCreatorFeeBps` (`cart-actions.ts:698`),
   the PDP uses `lookupFeeRate`. Three paths, two tables.

**Verdict: build, do not wire.** The schema is good leverage (per-process curves,
`minOrderValueCents`, `FeeBasis`, the rich `PartnerFinish` model are all well-shaped and
CIP4-aligned). What is missing is the evaluator, the printer pricing UI, and the wiring into charge
+ payout. There is no quote engine to wire TO.

## §2 PP-0: the P0 correctness fix (FIRST, standalone, no new schema)

**Principle: ONE pricing function, called by every surface.** The bug is not that a number is wrong;
it is that four functions compute prices independently, so they cannot agree. Fix the shape, and the
divergence cannot recur.

- Extract a single pure `computeOrderPricing(input) -> PricedOrder { lineItems[], subtotalCents,
  platformFeeCents, totalCents }` and make the PDP, configurator, checkout estimate, `OrderSummary`,
  and `placeOrder` ALL call it. `placeOrder` charges `PricedOrder.totalCents`; `OrderSummary` renders
  `PricedOrder.lineItems`. Divergence becomes structurally impossible.
- **Decide each disputed line item ONCE** (it is currently decided differently per surface):
  decoration and component upgrades are either charged AND shown, or neither. Recommended: charge
  them (they are real costs the creator selected), which makes the summary honest.
- **Kill the "Subscription savings" illusion** or implement it in `placeOrder`. Showing a discount
  that never applies is the worst option.
- **Collapse the fee to one SSOT:** every path resolves via `@ilaunchify/plans`
  `resolveCreatorFeeBps` per CLAUDE.md. Delete the `PlatformFeeConfig.baseRateBp` and `lookupFeeRate`
  fallbacks from the price paths.
- **Pins:** a suite asserting `estimate.totalCents === charge.totalCents` for a matrix of carts. This
  is the regression guard that makes PP-1 safe.

PP-0 changes NO prices by itself (except where the summary was lying). It is the foundation the rest
lands on.

## §3 The declaration model (D-P1: what a printer declares)

### 3.1 Per-process price curves (PS-9-0 schema BUILT, needs UI + evaluator)
`PartnerOfferingPriceCurve` (CIP4 PrintTalk 2.2 §4.1 shaped): `baseQty` (@BaseAmount, the real MOQ),
`basePriceCents` (@BasePrice, price AT baseQty with setup/plates amortized in), `incrementQty`
(@Amount, the increment AND the order lattice), `incrementPriceCents` (@Price), `maxQty`,
`quoteRequired`. Multiple rows per `(offering, printProcess)` = a piecewise curve.
```
price(qty) = basePriceCents + (qty - baseQty) * incrementPriceCents / incrementQty
```
**Setup/plate cost needs no separate field**: PrintTalk deliberately folds it into `basePrice` at
`baseQty`. A display-only "setup" figure can be DERIVED as
`basePriceCents - baseQty * incrementPriceCents / incrementQty` when that is positive.

**Partner UI (new):** in the offering editor, a "Presses & pricing" section: for each process you
own, add curve segments. This is where the industry truth from §11.2 lands: a converter with digital
+ flexo declares TWO curves and thereby serves a 100-unit job AND a 50,000-unit job.

### 3.2 Finishes pricing (model rich, needs a WRITE PATH)
`PartnerFinish` already supports `pricingMode = FLAT_PER_ORDER | PER_UNIT | PER_AREA | PER_OBJECT |
PER_COLOR | TIERED`, `basePriceCents` (setup per order), `perUnitPriceCents`, `pricePerSqInCents`,
`pricePerObjectCents`, `pricePerColorCents`, `pricingTiers`, `moqMin`, `maxCoveragePct`.
**Build the partner editor** (`/packaging/finishes` or a tab in the service editor) so rows can
exist; today finishes are permanently $0. Evaluator maps each mode to cents (§4). `maxCoveragePct`
and `moqMin` are ALSO capability constraints and feed §11's filter 9.

### 3.3 Order-value floor + quote-required
- `PartnerService.minOrderValueCents` (BUILT in PS-9-0): the commercial floor real converters enforce
  ("no MOQ, but our minimum order is ~$200"). Add the field to the service editor. The evaluator
  reports a shortfall; the creator sees "this printer needs a $200 minimum" rather than a silent
  exclusion.
- `PartnerOfferingPriceCurve.quoteRequired` (BUILT): the printer is ELIGIBLE but the computed price
  is INDICATIVE. Never auto-bind it: route to a quote (reuse the §10 Capability RFQ rail rather than
  inventing a second messaging path).

### 3.4 Die-cut / substrate surcharges (fields exist, are dead)
Wire `PartnerServiceDieCut.surchargeCents` (+ `leadTimeDays`) and
`PartnerServiceSubstrate.perUnitCostCents` (+ `moqMin`, `extraLeadTimeDays`) into the editors that
today write IDs only (`onboarding/actions.ts:259-277`, `ServiceEditors.tsx`), and read them in the
evaluator. Per-partner substrate cost must OVERRIDE the platform `Substrate.baseUnitCostCents` that
checkout uses today.

### 3.5 Gaps found while prototyping the Service Builder (added 2026-07-15)

Building `design/print-service-builder-prototype.html` surfaced nine things the four D-P1 buckets do
not cover. Ordered by monetization impact. All are additive.

**3.5.1 Tooling + repeat runs (the biggest gap).** Plates and dies are made ONCE and KEPT. Charging a
repeat customer full setup again prices out the stickiest revenue there is; not charging it on run
one is a straight loss. The trade press is blunt about the stakes: "well over 70 percent of short-run
jobs are, in fact, long-run jobs broken down into multiple smaller batches" (Thomas-Emans, L&L), and
"the cost of flexo plates is amortized the more times the same job is re-run." So repeats ARE the
business.
- `PartnerOfferingTooling`-ish fields: `dieToolingCents` (one-time per SHAPE, reused on repeats),
  `platePerColorCents` (one-time per ARTWORK, flexo).
- A repeat rule: when the artwork + die are unchanged, setup is waived / discounted. Requires
  identifying "same artwork" (a design/version hash on the component or dieline) and a record of what
  tooling already exists for that (product, printer) pair.
- This is also the honest V2 hook: amortized tooling is what makes the buffer/pooling moat real.

**3.5.2 MOQ is per DESIGN, not per order.** PackMojo: "500 units per design." Sticker Mule: "the
minimum order quantity of our custom labels is 50 units per design." A 6-flavour variety pack is SIX
print runs, each clearing its own floor. §11.9 already computes `printQty` per label SKU; this makes
the *declaration* explicit: `minimumAppliesPer: DESIGN | ORDER` on the curve/service, defaulting to
DESIGN (the industry norm). Without it a 6-flavour pack silently looks feasible at 1/6 of the real
run.

**3.5.3 Finished format: roll / core / rewind (unmodelled, and a real MOQ driver).** OnlineLabels
publishes minimums **in rolls, varying by core diameter** ("100 sheets, ~20 rolls (1in cores), or ~12
rolls (3in cores)"). Two shops with identical piece-MOQs are NOT interchangeable if one cannot wind a
3in core. Needs: `deliveryFormat` (ROLL | SHEET | FAN_FOLD), `coreSizes[]`, `rewindDirections[]`,
`maxLabelsPerRoll`, `maxRollDiameterMm`, `splicesAllowedPerRoll`. These are BOTH capability filters
(§11 hard gates) and price/packing drivers.

**3.5.4 Rush / expedite.** The most reliable margin line in print and there is no field for it:
`rushLeadTimeDays`, `rushUpliftPct`, `rushCapacityPerWeek`. Capacity matters as much as price: a rush
promise without a cap oversells the press. Applies to the print subtotal.

**3.5.5 Prepress / proofing fees.** Converters bill these routinely; we cannot charge a cent:
`artFixFeeCents` (per job, when files fail preflight), `pantoneMatchFeeCents` (per spot colour
matched), `hardProofFeeCents` (soft proof free, press proof by quote). These pair naturally with the
§7.3 filter-7 design preflight: the same check that FAILS a file can PRICE fixing it.

**3.5.6 Overs / unders policy.** The industry norm is +/-10% with the ACTUAL shipped quantity billed.
This changes what "500 units" even means, so it belongs in the declaration, not in fine print:
`oversUndersPolicy: EXACT | PLUS_MINUS_PCT`, `oversUndersPct`. Interacts with §11.9's `printOveragePct`
(that is OUR spoilage provisioning; this is THEIR shipping/billing tolerance). Keep them distinct.

**3.5.7 Order lattice.** Quantity is a lattice, not a range: PrintTalk models it
(`@Amount` = "the allowed increments of ordered amounts"), and Sticker Mule enforces it in the wild
("enter any multiple of 10"). `PartnerOfferingPriceCurve.incrementQty` ALREADY carries this; what is
missing is that the checkout quantity picker must SNAP to it and the evaluator must reject
off-lattice quantities rather than silently interpolating.

**3.5.8 Versioning / variable data.** Digital's actual superpower and a real line item:
`additionalVersionCents` (per extra design in the same run). Also the lever behind 3.5.1: versioning
plus repeats is where digital beats flexo regardless of raw run length.

**3.5.9 Price validity.** `effectiveFrom` / `validUntil` on the curve so a printer can raise prices
without rewriting history, and so a stale curve can be flagged rather than silently trusted.
PrintTalk has `Quotation/@Expires` + `@Estimate` (binding vs non-binding) for exactly this. Pairs
with the §5 snapshot rule: the ORDER keeps the curve it was priced on.

**Two design rules (not fields) from the same pass:**
- **Rush capacity is a promise, not a price.** Declare it or the press gets oversold.
- **Incomplete capability = not listable** (§7.2.7's discipline). A half-declared service should fail
  LOUDLY at publish rather than quietly lose jobs it would have won.

**Deliberately NOT added: a "we choose the press" toggle.** Domino's argument is that converters route
by press AVAILABILITY day to day, not by a fixed rule. If we ever let them express that, it belongs as
CAPACITY (3.5.4's shape), never as a pricing rule, and never as a hardcoded crossover.

## §4 The evaluator (pure, the heart of it)

New pure module beside `print-eligibility.ts` (sibling concept: eligibility FILTERS, pricing
EVALUATES). Never touches prisma; callers load.

```ts
evaluatePrintPrice(job: PrintJobRequirements, cand: PrintProviderCandidate): PrintPriceQuote | null

interface PrintPriceQuote {
  processUsed: PrintProcess          // which press won, DERIVED not declared
  lineItems: Array<{ kind: 'PRINT' | 'FINISH' | 'DIECUT' | 'SUBSTRATE'; label: string; cents: number }>
  subtotalCents: number
  quoteRequired: boolean             // any contributing segment was indicative
  meetsOrderValueFloor: boolean
  orderValueShortfallCents?: number
}
```
Rules:
1. Evaluate EVERY feasible curve segment (§11.9 feasibility: `baseQty <= printQty <= maxQty` and the
   lattice `(printQty - baseQty) % incrementQty == 0`), across ALL of the printer's processes.
2. `price = min(...)` over feasible segments. **The digital-vs-flexo crossover is EMERGENT from this
   min(), never a hardcoded threshold** (§11.9; Domino: the crossover "is not fixed ... it is
   continuously shifting"; a real Label Traxx estimate put it at 24,140 labels vs the popular
   "2,000-5,000" folklore).
3. Add finishes (per `pricingMode`), die-cut surcharge, per-partner substrate cost.
4. Apply the order-value floor as a REPORTED shortfall, not a silent exclusion.
5. `quoteRequired` propagates: if the winning segment is indicative, the whole quote is indicative.

Selection across printers stays §11's job: hard capability filter, then rotation among the eligible.
Price is a REPORTED output, and (open question, §7) may or may not influence which eligible printer
wins.

## §5 Wiring (where the money actually lands)

- **Creator charge:** `placeOrder` uses `computeOrderPricing` (PP-0), whose PRINT line comes from
  `evaluatePrintPrice`. **Deletes the hardcoded `8 +` anchor** (`cart-actions.ts:609`).
- **Printer payout:** `dispatch-planner` sets `printProviderCostCents = the quote's print subtotal`.
  **Deletes `Math.floor(total * 0.08)`.** `Transfer.amountCents` already mirrors `costCents`, so the
  payout becomes real the moment this lands.
- **Cost summary:** `OrderSummary` renders `PricedOrder.lineItems` (the same object charged), so
  "labels $X / product $Y / fulfillment $Z" is finally true.
- **Snapshot at order time.** Prices must be frozen onto the order/dispatch (the platform already
  snapshots fees onto `Order.platformFeeBps/Cents/Source`). A printer editing a curve tomorrow must
  never alter yesterday's order. Recommend `OrderDispatch.priceQuoteJson` for the evaluated line
  items + the curve version used.

## §6 Admin hybrid override (D-P2)

**Today: nothing.** No admin file touches offerings at all (deliberate, PS-8c: "offerings are
partner-activated; there is NO admin"). The only lever is PRINT_ROTATION, which is one flag per
printer PLATFORM-WIDE (`access/actions.ts:54-58`, `updateMany` by partnerId, no product filter).
`ProductPrintSelection` is a creator's private pin; `PartnerNomination` has no `productId` and
structurally cannot be per-product.

New model (additive):
```prisma
/// Admin curation of the per-template printer pool (D-P2). The ENGINE computes
/// eligibility; this only records deliberate, audited exceptions.
model TemplatePrinterOverride {
  id                String       @id @default(uuid())
  productTemplateId String
  partnerServiceId  String       // the LABEL_PRINTING service
  state             OverrideState // BLOCK | FORCE_INCLUDE
  reason            String       @db.String(500)   // required: this is an exception, justify it
  setById           String
  createdAt         DateTime     @default(now())
  @@unique([productTemplateId, partnerServiceId])
  @@index([productTemplateId])
}
enum OverrideState { BLOCK  FORCE_INCLUDE }
```
Resolver: `pool = engineEligible - BLOCKed + FORCE_INCLUDEd`.

**The hard-gate guard (non-negotiable).** A FORCE_INCLUDE may never bypass a compliance filter.
Concretely: if the job `requiresFoodContact` and the printer is not `foodContactSafe`, the override
is REFUSED at write time with a clear error, not silently honored. Admin may override soft or
undeclared gaps (e.g. substrate not declared, envelope unknown); never safety. Every write audits
(`TemplatePrinterOverride` entity + reason + which filter it bypassed).

**Surface:** a "Print providers" panel on the admin product/template detail listing engine-eligible
printers (with the pass/fail reason per §7.3's machine-readable codes), a per-row Block, and an "Add
printer (override)" action that runs the hard-gate guard first. Complements, not replaces, the
platform-wide PRINT_ROTATION lever.

**Why not an admin allowlist per product** (rejected): O(products x printers) toil, re-centralizes
what the engine computes, makes admin the bottleneck on every launch (against the 15-minute creator
promise), and admin does not know a printer's press capability better than the printer does. A
temporary allowlist posture during the curated launch is defensible as a PHASE, never the
architecture.

## §7 Build phases (PP)

- **PP-0 (P0, first, no schema):** one `computeOrderPricing`; charge == summary; decide
  decoration/components once; kill or implement subscription savings; collapse the fee to
  `resolveCreatorFeeBps`; estimate-vs-charge pins.
- **PP-1 (the core):** the pure evaluator + partner curve UI; wire into charge + payout + summary;
  snapshot onto the dispatch. Deletes the 8c anchor and the 8% payout.
- **PP-2 (finishes):** `PartnerFinish` partner editor (the write path) + evaluator modes + feed
  §11 filter 9.
- **PP-3 (floor + quote):** `minOrderValueCents` in the service editor; shortfall reporting;
  `quoteRequired` routes to the §10 RFQ rail; **order lattice** (3.5.7) snapping in the qty picker +
  evaluator rejection of off-lattice quantities.
- **PP-4 (surcharges):** wire die-cut surcharge + per-partner substrate cost (override the platform
  cost); editors that today write IDs only.
- **PP-6 (tooling + repeats, 3.5.1), the highest-value addition:** `dieToolingCents` /
  `platePerColorCents`, an artwork identity for "same job", a record of tooling already made per
  (product, printer), and the repeat rule (setup waived/discounted). Do this EARLY: it is where the
  retention economics live, and 70%+ of "short runs" are repeats.
- **PP-7 (declaration completeness, 3.5.2-3.5.6, 3.5.8-3.5.9):** `minimumAppliesPer` (DESIGN default);
  finished format (roll/core/rewind, ALSO §11 hard filters); rush (lead/uplift/capacity); prepress
  fees (art-fix / Pantone / hard proof); overs-unders policy; `additionalVersionCents`;
  `effectiveFrom` / `validUntil`. Mostly additive fields + the Service Builder steps that carry them.
- **PP-5 (admin hybrid, D-P2):** `TemplatePrinterOverride` + resolver + hard-gate guard + admin
  panel + audit.

Sequencing note: PP-0 before everything (it is the regression guard). PP-1 depends on PS-9-0's schema
(`db:push` + backfill). PP-5 depends on §11 PS-9a (there must be an engine-eligible set to override).

## §8 Risks / open questions

- **Price changes are real changes.** PP-1 replaces a hardcoded 8c with declared prices: creator
  totals and printer payouts WILL move. Needs a comms + migration plan, and probably a shadow period
  comparing evaluated vs current numbers before flipping the charge.
- **Partners must populate curves or nothing prices.** The PS-9-0 backfill seeds one curve per
  offering (`quoteRequired=true` where no tiers exist), so the floor is "quote", never "$0". Watch
  the undeclared-process count from the backfill.
- **OPEN: does price influence WHICH eligible printer wins?** Today rotation is fair-share by rating
  and ignores price. Real MIS picks the cheapest surviving press. Options: (a) keep rotation
  price-blind (fairness), (b) let price break ties inside a band, (c) cheapest-wins. Not decided;
  affects the marketplace's character (fair-share vs race-to-the-bottom). Recommend (a) for v1 and
  revisit with data.
- **Manufacturer parity.** `ProductTemplateFee` (`PER_UNIT | PER_SKU_ONE_TIME | PER_ORDER` +
  `waivedAboveQty`) has a `saveFees` action but NO UI renders it (`build-actions.ts:1436`). The same
  "declared but unreachable" disease. Worth folding into PP-1/PP-2 so both sides of the order price
  honestly.
- **Migration state.** `PartnerOfferingPriceCurve` and `ProductTemplateFee` are both accessed via
  `prisma as unknown as {...}` casts pending `db:push`.
